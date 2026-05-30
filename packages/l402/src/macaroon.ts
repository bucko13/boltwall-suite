import { hexToBytes, timingSafeEqual } from "@boltwall/internal";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { importMacaroon } from "macaroon";

import { parseCaveat, serializeCaveat, type Caveat } from "./caveats";
import { decodeIdentifierFields, type MacaroonIdentifierV0 } from "./identifier";
import { base64ToBytes, bytesToBase64 } from "./internal/base64";
import type { RootKeyStore } from "./root-key-store";
import type { CaveatContext, CaveatSatisfier } from "./satisfiers";

const ROOT_KEY_LENGTH = 32;
const PAYMENT_HASH_LENGTH = 32;
const PREIMAGE_LENGTH = 32;
const TOKEN_ID_LENGTH = 32;
const IDENTIFIER_V0_LENGTH = 66;
const SIGNATURE_LENGTH = 32;
const FIELD_EOS = 0;
const FIELD_IDENTIFIER = 2;
const FIELD_SIGNATURE = 6;

// ---------------------------------------------------------------------------
// Verification failure reasons
// ---------------------------------------------------------------------------

/**
 * Stable, exported runtime strings for L402 macaroon verification failure
 * reasons that do not carry a per-condition suffix.
 *
 * Const object (not a TypeScript enum) so the runtime values stay stable
 * across ESM bundling and let downstream packages compare values without
 * hard-coding string literals. Compare against `VerificationFailureReason.X`
 * rather than the underlying string; the runtime values are guaranteed stable,
 * the keys are presentational and may evolve.
 *
 * Spec: L402 macaroon-spec.md §Verification — these reasons cover the HMAC
 * chain, preimage binding, and caveat evaluation steps `verifyMacaroon` runs.
 *
 * @example
 * const result = await verifyMacaroon(args);
 * if (!result.ok && result.reason === VerificationFailureReason.UnknownToken) {
 *   // root key was rotated or never minted by this server
 * }
 */
export const VerificationFailureReason = {
  /** HMAC signature did not validate against the server-side root key. */
  SignatureInvalid: "signature-invalid",
  /** No root key was found for the macaroon's v0 identifier `token_id`. */
  UnknownToken: "unknown-token",
  /** Preimage does not match the macaroon's embedded payment hash. */
  PreimageMismatch: "preimage-mismatch",
} as const;

/**
 * Prefixes for the template-form verification failure reasons.
 *
 * `CaveatRejected` carries the caveat condition (e.g. `caveat-rejected:expiration`).
 * `UnknownCaveat` carries the unmatched condition when `strictUnknownCaveats`
 * is enabled (e.g. `unknown-caveat:foo`).
 *
 * @example
 * if (!result.ok && result.reason.startsWith(VerificationFailurePrefix.CaveatRejected)) {
 *   const condition = result.reason.slice(VerificationFailurePrefix.CaveatRejected.length);
 * }
 */
export const VerificationFailurePrefix = {
  CaveatRejected: "caveat-rejected:",
  UnknownCaveat: "unknown-caveat:",
} as const;

/**
 * Union of every reason value `verifyMacaroon` may return in a failed result,
 * including the per-condition template variants.
 *
 * Downstream code mapping failures to user-facing errors should switch on
 * `VerificationFailureReason` constants for the fixed cases and use
 * `String#startsWith(VerificationFailurePrefix.X)` for the template cases.
 */
export type VerificationFailureReasonValue =
  | (typeof VerificationFailureReason)[keyof typeof VerificationFailureReason]
  | `${typeof VerificationFailurePrefix.CaveatRejected}${string}`
  | `${typeof VerificationFailurePrefix.UnknownCaveat}${string}`;

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/**
 * Inputs for minting a new L402 macaroon.
 */
export interface MintMacaroonArgs {
  /**
   * Secret 32-byte root key used to compute the macaroon HMAC chain.
   *
   * Root keys are bearer-sensitive server-side material and must not be logged
   * or sent to clients.
   */
  rootKey: Uint8Array;
  /** Decoded v0 identifier fields to encode into the macaroon. */
  identifier: MacaroonIdentifierV0;
  /** Optional first-party caveats to bind into the minted macaroon. */
  caveats?: Array<Caveat | string>;
}

/**
 * Mint a base64-encoded L402 macaroon from a root key, v0 identifier, and
 * optional first-party caveats.
 *
 * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format and
 * §Minting require a 66-byte identifier encoded as
 * `uint16 version || 32-byte payment_hash || 32-byte token_id`, then an
 * HMAC-SHA256 chain over the identifier and each UTF-8 caveat string.
 *
 * Throws `RangeError` if the root key, payment hash, or token id length is not
 * exactly 32 bytes, and `unsupported-identifier-version` for non-zero versions.
 *
 * @example
 * const macaroon = mintMacaroon({
 *   rootKey, // Uint8Array(32)
 *   identifier: { version: 0, paymentHash, tokenId },
 *   caveats: [validUntil({ seconds: 3600 })],
 * });
 */
export function mintMacaroon(args: MintMacaroonArgs): string {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  const identifier = encodeIdentifier(args.identifier);
  const caveats = (args.caveats ?? []).map((caveat) =>
    new TextEncoder().encode(typeof caveat === "string" ? caveat : serializeCaveat(caveat)),
  );

  return encodeRaw(
    mintRaw({
      rootKey: args.rootKey,
      identifier,
      caveats,
    }),
  );
}

function encodeIdentifier(identifier: MacaroonIdentifierV0): Uint8Array {
  if (identifier.version !== 0) {
    throw new Error("unsupported-identifier-version");
  }
  assertLength(identifier.paymentHash, PAYMENT_HASH_LENGTH, "paymentHash");
  assertLength(identifier.tokenId, TOKEN_ID_LENGTH, "tokenId");

  const bytes = new Uint8Array(IDENTIFIER_V0_LENGTH);
  // L402 macaroon-spec.md §Identifier Structure: all multi-byte integers are
  // big-endian; version 0 is encoded as two zero bytes.
  new DataView(bytes.buffer).setUint16(0, identifier.version, false);
  bytes.set(identifier.paymentHash, 2);
  bytes.set(identifier.tokenId, 2 + PAYMENT_HASH_LENGTH);
  return bytes;
}

// ---------------------------------------------------------------------------
// Preimage verification
// ---------------------------------------------------------------------------

/**
 * Either a 32-byte `Uint8Array` or a 64-char hex string. Internal helpers
 * normalize both to `Uint8Array` at the function boundary.
 */
type Bytes32Input = Uint8Array | string;

/**
 * Inputs for {@link verifyPreimage}.
 */
export interface VerifyPreimageArgs {
  /** Payment hash (32 bytes) embedded in the macaroon's v0 identifier. */
  paymentHash: Bytes32Input;
  /** Lightning payment preimage (32 bytes) revealed after invoice settlement. */
  preimage: Bytes32Input;
}

function normalizeBytes32(value: Bytes32Input, label: string): Uint8Array {
  const bytes = typeof value === "string" ? hexToBytes(value) : value;
  if (bytes.length !== PAYMENT_HASH_LENGTH) {
    throw new RangeError(
      `${label} must be ${String(PAYMENT_HASH_LENGTH)} bytes, got ${String(bytes.length)}`,
    );
  }
  return bytes;
}

/**
 * Verify that a Lightning payment preimage hashes to the macaroon's
 * `payment_hash` — i.e. that the bearer of this credential paid the invoice the
 * macaroon was minted against.
 *
 * Spec: L402 macaroon-spec.md §Identifier — the v0 identifier embeds
 * `payment_hash` (32 bytes); the verifier MUST check
 * `sha256(preimage) === payment_hash` in constant time.
 *
 * Inputs may be `Uint8Array` (32 bytes) or hex `string` (64 chars,
 * case-insensitive). Both are normalized to `Uint8Array` at the boundary.
 *
 * Throws `RangeError` on length mismatch (length is not secret) and on
 * malformed hex strings; returns `false` for any other mismatch (do NOT throw
 * on cryptographic failure — surface that as a boolean to the caller, who
 * decides how to translate it into HTTP 401 / log lines).
 *
 * @example
 * verifyPreimage({
 *   paymentHash: "00112233...", // 64 hex chars
 *   preimage: "ffeeddcc...", // 64 hex chars
 * }); // → boolean
 */
export function verifyPreimage(args: VerifyPreimageArgs): boolean {
  const paymentHash = normalizeBytes32(args.paymentHash, "paymentHash");
  const preimage = normalizeBytes32(args.preimage, "preimage");
  if (preimage.length !== PREIMAGE_LENGTH) {
    throw new RangeError(
      `preimage must be ${String(PREIMAGE_LENGTH)} bytes, got ${String(preimage.length)}`,
    );
  }

  const computed = sha256(preimage);
  return timingSafeEqual(computed, paymentHash);
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/**
 * Display-oriented view of a first-party macaroon caveat.
 */
export interface InspectedMacaroonCaveat {
  /** Raw UTF-8 bytes encoded into the macaroon HMAC chain. */
  raw: Uint8Array;
  /** UTF-8 caveat text as stored in the macaroon. */
  text: string;
  /** Condition segment before the first `=`. Falls back to `text` for malformed caveats. */
  condition: string;
  /** Value segment after the first `=`. Empty for malformed caveats. */
  value: string;
  /** Parsed caveat, or `null` when the raw text is not `condition=value`. */
  parsed: Caveat | null;
}

/**
 * Inspection view for a base64-encoded L402 macaroon.
 */
export interface MacaroonInspection {
  /**
   * Decoded version-0 identifier fields.
   *
   * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format.
   */
  identifier: MacaroonIdentifierV0;
  /** Raw 66-byte identifier bytes. */
  identifierBytes: Uint8Array;
  /**
   * First-party caveats in macaroon order.
   *
   * Spec: L402 macaroon-spec.md §Caveat Format.
   */
  caveats: InspectedMacaroonCaveat[];
  /** Raw 32-byte HMAC signature. */
  signature: Uint8Array;
}

/**
 * Decode a base64-encoded L402 macaroon into protocol-owned inspection fields.
 *
 * This helper is intended for diagnostics and UI review surfaces. It does not
 * verify the macaroon signature or payment preimage; use `verifyMacaroon` for
 * authorization decisions.
 *
 * Spec: L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary
 * Format for the base64 V2 wrapper, §Identifier Structure for the v0
 * identifier, and §Caveat Format for UTF-8 first-party caveats.
 *
 * Throws synchronously on malformed macaroon input.
 *
 * @example
 * const view = inspectMacaroon(macaroonB64);
 * view.identifier.version; // 0
 * view.caveats.map((c) => c.text); // ["valid-until=...", ...]
 */
export function inspectMacaroon(macaroon: string): MacaroonInspection {
  const raw = decodeRaw(macaroon);
  const identifier = decodeIdentifierFields(macaroon);
  const decoder = new TextDecoder();

  return {
    identifier,
    identifierBytes: raw.identifier.slice(),
    caveats: raw.caveats.map((caveat) => inspectCaveat(caveat, decoder)),
    signature: raw.signature.slice(),
  };
}

function inspectCaveat(raw: Uint8Array, decoder: TextDecoder): InspectedMacaroonCaveat {
  const bytes = raw.slice();
  const text = decoder.decode(bytes);

  try {
    const parsed = parseCaveat(text);
    return {
      raw: bytes,
      text,
      condition: parsed.condition,
      value: parsed.value,
      parsed,
    };
  } catch {
    return {
      raw: bytes,
      text,
      condition: text,
      value: "",
      parsed: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/**
 * Inputs for end-to-end L402 macaroon verification.
 */
export interface VerifyMacaroonArgs {
  /** One or more base64-encoded L402 macaroons from an Authorization header. */
  macaroons: string[];
  /** 32-byte Lightning payment preimage as hex or raw bytes. */
  preimage?: string | Uint8Array;
  /** Server-side root key store indexed by v0 token id. */
  rootKeyStore: RootKeyStore;
  /** Caveat satisfiers the caller explicitly opts into for this verifier. */
  satisfiers: CaveatSatisfier[];
  /** Request-scoped context passed to caveat satisfiers. */
  context: CaveatContext;
  /**
   * Reject unknown caveats instead of skipping them.
   *
   * Defaults to `false` because the L402 macaroon spec requires unknown
   * caveats to be skipped. Middleware must declare the known caveats it
   * depends on explicitly instead of relying on fail-closed unknown behavior.
   */
  strictUnknownCaveats?: boolean;
  /**
   * Require the L402 preimage proof after signature and caveat checks.
   *
   * Defaults to `true` per L402 protocol-specification.md §6.1. Only set this
   * to `false` for stateful HODL invoice flows that verify a held payment via
   * a trusted Lightning backend before authorizing access.
   */
  requirePreimage?: boolean;
}

/**
 * Result of L402 macaroon verification.
 */
export type VerifyMacaroonResult =
  | { ok: true }
  | {
      ok: false;
      reason: VerificationFailureReasonValue;
    };

/**
 * Verify L402 macaroons, preimage binding, signature integrity, and caveats.
 *
 * Spec citations:
 * - L402 macaroon-spec.md §Verification / Step 1: recompute the HMAC chain
 *   using the server-side root key and compare signatures in constant time.
 * - L402 macaroon-spec.md §Verification / Step 2: verify the credential
 *   preimage against the `payment_hash` embedded in the v0 identifier.
 * - L402 macaroon-spec.md §Verification / Step 3: evaluate repeated caveats
 *   with `SatisfyPrevious`, then the final caveat with `SatisfyFinal`; if no
 *   satisfier matches a caveat condition, the caveat MUST be skipped.
 *
 * Returns a discriminated result rather than throwing for authorization
 * failures so callers can map `reason` onto HTTP 401 responses and log lines.
 *
 * @example
 * const result = await verifyMacaroon({
 *   macaroons: [macaroonB64],
 *   preimage: preimageHex,
 *   rootKeyStore,
 *   satisfiers: [validUntilSatisfier()],
 *   context: { request, now: new Date() },
 * });
 * if (!result.ok) {
 *   // result.reason e.g. VerificationFailureReason.PreimageMismatch
 * }
 */
export async function verifyMacaroon(args: VerifyMacaroonArgs): Promise<VerifyMacaroonResult> {
  if (args.macaroons.length === 0) {
    throw new Error("empty macaroon credential");
  }

  let firstPaymentHash: Uint8Array | null = null;
  for (const macaroon of args.macaroons) {
    const raw = safeDecodeRaw(macaroon);
    if (raw === null) {
      return { ok: false, reason: VerificationFailureReason.SignatureInvalid };
    }
    const identifier = safeDecodeIdentifierBytes(raw.identifier);
    if (identifier === null) {
      return { ok: false, reason: VerificationFailureReason.SignatureInvalid };
    }
    firstPaymentHash ??= identifier.paymentHash;

    if (!timingSafeEqual(identifier.paymentHash, firstPaymentHash)) {
      return { ok: false, reason: VerificationFailureReason.PreimageMismatch };
    }

    const rootKey = await args.rootKeyStore.get(identifier.tokenId);
    if (rootKey === null) {
      return { ok: false, reason: VerificationFailureReason.UnknownToken };
    }
    if (!safeVerifyRawSignature({ macaroon: raw, rootKey })) {
      return { ok: false, reason: VerificationFailureReason.SignatureInvalid };
    }

    const caveats = raw.caveats.map(safeDecodeCaveat);
    if (caveats.some((caveat) => caveat === null)) {
      return {
        ok: false,
        reason: `${VerificationFailurePrefix.CaveatRejected}invalid`,
      };
    }
    const caveatResult = await verifyCaveats({
      caveats: caveats.filter((caveat): caveat is Caveat => caveat !== null),
      satisfiers: args.satisfiers,
      context: args.context,
      strictUnknownCaveats: args.strictUnknownCaveats === true,
    });
    if (!caveatResult.ok) {
      return caveatResult;
    }
  }

  if (firstPaymentHash === null) {
    return { ok: false, reason: VerificationFailureReason.SignatureInvalid };
  }
  if (args.preimage === undefined) {
    return args.requirePreimage === false
      ? { ok: true }
      : { ok: false, reason: VerificationFailureReason.PreimageMismatch };
  }
  try {
    if (!verifyPreimage({ paymentHash: firstPaymentHash, preimage: args.preimage })) {
      return { ok: false, reason: VerificationFailureReason.PreimageMismatch };
    }
  } catch {
    return { ok: false, reason: VerificationFailureReason.PreimageMismatch };
  }

  return { ok: true };
}

function safeDecodeRaw(macaroon: string) {
  try {
    return decodeRaw(macaroon);
  } catch {
    return null;
  }
}

function safeVerifyRawSignature(args: Parameters<typeof verifyRawSignature>[0]): boolean {
  try {
    return verifyRawSignature(args);
  } catch {
    return false;
  }
}

async function verifyCaveats(args: {
  caveats: Caveat[];
  satisfiers: CaveatSatisfier[];
  context: CaveatContext;
  strictUnknownCaveats: boolean;
}): Promise<VerifyMacaroonResult> {
  const groups = new Map<string, Caveat[]>();
  for (const caveat of args.caveats) {
    const satisfier = args.satisfiers.find((entry) =>
      matchesCondition(entry.condition, caveat.condition),
    );
    if (satisfier === undefined) {
      if (args.strictUnknownCaveats) {
        return {
          ok: false,
          reason: `${VerificationFailurePrefix.UnknownCaveat}${caveat.condition}`,
        };
      }
      continue;
    }

    const entries = groups.get(caveat.condition);
    if (entries === undefined) {
      groups.set(caveat.condition, [caveat]);
    } else {
      entries.push(caveat);
    }
  }

  for (const [condition, caveats] of groups) {
    const satisfier = args.satisfiers.find((entry) => matchesCondition(entry.condition, condition));
    if (satisfier === undefined) {
      continue;
    }

    for (let i = 1; i < caveats.length; i++) {
      const previous = caveats[i - 1];
      const next = caveats[i];
      if (
        previous === undefined ||
        next === undefined ||
        !(await safeSatisfyPrevious(satisfier, previous, next))
      ) {
        return {
          ok: false,
          reason: `${VerificationFailurePrefix.CaveatRejected}${condition}`,
        };
      }
    }

    const finalCaveat = caveats.at(-1);
    if (finalCaveat === undefined) {
      continue;
    }
    if (!(await safeSatisfyFinal(satisfier, finalCaveat, args.context))) {
      return {
        ok: false,
        reason: `${VerificationFailurePrefix.CaveatRejected}${condition}`,
      };
    }
  }

  return { ok: true };
}

async function safeSatisfyPrevious(
  satisfier: CaveatSatisfier,
  previous: Caveat,
  next: Caveat,
): Promise<boolean> {
  try {
    return satisfier.satisfyPrevious?.(previous, next) !== false;
  } catch {
    return false;
  }
}

async function safeSatisfyFinal(
  satisfier: CaveatSatisfier,
  caveat: Caveat,
  context: CaveatContext,
): Promise<boolean> {
  try {
    return await satisfier.satisfyFinal(caveat, context);
  } catch {
    return false;
  }
}

function safeDecodeIdentifierBytes(identifier: Uint8Array): {
  paymentHash: Uint8Array;
  tokenId: Uint8Array;
} | null {
  if (identifier.length !== IDENTIFIER_V0_LENGTH) {
    return null;
  }
  const version = new DataView(
    identifier.buffer,
    identifier.byteOffset,
    identifier.byteLength,
  ).getUint16(0, false);
  if (version !== 0) {
    return null;
  }

  return {
    paymentHash: identifier.slice(2, 2 + PAYMENT_HASH_LENGTH),
    tokenId: identifier.slice(2 + PAYMENT_HASH_LENGTH, 2 + PAYMENT_HASH_LENGTH + TOKEN_ID_LENGTH),
  };
}

function safeDecodeCaveat(caveat: Uint8Array): Caveat | null {
  try {
    return parseCaveat(new TextDecoder().decode(caveat));
  } catch {
    return null;
  }
}

function matchesCondition(condition: string | RegExp, caveatCondition: string): boolean {
  return typeof condition === "string"
    ? condition === caveatCondition
    : condition.test(caveatCondition);
}

// ---------------------------------------------------------------------------
// Internal V2 binary macaroon codec
// ---------------------------------------------------------------------------
//
// Low-level raw macaroon primitives. These are NOT part of the public barrel;
// they back the public mint/verify/inspect helpers above and the `L402`
// facade. The V2 binary layout targets Aperture's gopkg.in/macaroon.v2 codec;
// see docs/protocol-compatibility.md.

export interface RawMacaroon {
  identifier: Uint8Array;
  caveats: Uint8Array[];
  signature: Uint8Array;
}

export function decodeRaw(macaroonB64: string): RawMacaroon {
  const macaroon = normalizeImportedMacaroon(importMacaroon(base64ToBytes(macaroonB64)));
  return rawFromLibraryMacaroon(macaroon);
}

export function encodeRaw(raw: RawMacaroon): string {
  assertRawMacaroon(raw);
  return bytesToBase64(encodeBinaryV2(raw));
}

export function mintRaw(args: {
  rootKey: Uint8Array;
  identifier: Uint8Array;
  caveats?: Uint8Array[];
}): RawMacaroon {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  assertLength(args.identifier, IDENTIFIER_V0_LENGTH, "identifier");
  const caveats = (args.caveats ?? []).map((caveat) => copyBytes(caveat));
  return {
    identifier: copyBytes(args.identifier),
    caveats,
    signature: computeSignature(args.rootKey, args.identifier, caveats),
  };
}

export function verifyRawSignature(args: { macaroon: RawMacaroon; rootKey: Uint8Array }): boolean {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  assertRawMacaroon(args.macaroon);
  const expected = computeSignature(args.rootKey, args.macaroon.identifier, args.macaroon.caveats);
  return timingSafeEqual(expected, args.macaroon.signature);
}

export function addFirstPartyCaveat(macaroon: RawMacaroon, caveat: Uint8Array): RawMacaroon {
  assertRawMacaroon(macaroon);
  const nextCaveat = copyBytes(caveat);
  return {
    identifier: copyBytes(macaroon.identifier),
    caveats: [...macaroon.caveats.map((entry) => copyBytes(entry)), nextCaveat],
    signature: signNext(macaroon.signature, nextCaveat),
  };
}

function rawFromLibraryMacaroon(macaroon: {
  caveats: Array<{ identifier: Uint8Array; vid?: Uint8Array }>;
  identifier: Uint8Array;
  signature: Uint8Array;
}): RawMacaroon {
  const caveats = macaroon.caveats.map((caveat) => {
    if (caveat.vid !== undefined) {
      throw new Error("unsupported-third-party-caveat");
    }
    return copyBytes(caveat.identifier);
  });
  const raw = {
    identifier: copyBytes(macaroon.identifier),
    caveats,
    signature: copyBytes(macaroon.signature),
  };
  assertRawMacaroon(raw);
  return raw;
}

function normalizeImportedMacaroon(macaroon: ReturnType<typeof importMacaroon>): {
  caveats: Array<{ identifier: Uint8Array; vid?: Uint8Array }>;
  identifier: Uint8Array;
  signature: Uint8Array;
  exportBinary(): Uint8Array;
} {
  if (Array.isArray(macaroon)) {
    throw new Error("expected-single-macaroon");
  }
  return macaroon;
}

function computeSignature(
  rootKey: Uint8Array,
  identifier: Uint8Array,
  caveats: Uint8Array[],
): Uint8Array {
  // L402 macaroon-spec.md §HMAC Chain Construction and §Verification:
  // sig_0 = HMAC(root_key, identifier), then each first-party caveat is
  // chained as HMAC(previous_sig, caveat_id).
  let signature: Uint8Array = copyBytes(hmac(sha256, rootKey, identifier));
  for (const caveat of caveats) {
    signature = signNext(signature, caveat);
  }
  return signature;
}

function signNext(previousSignature: Uint8Array, caveat: Uint8Array): Uint8Array {
  assertLength(previousSignature, SIGNATURE_LENGTH, "signature");
  return copyBytes(hmac(sha256, previousSignature, caveat));
}

function encodeBinaryV2(raw: RawMacaroon): Uint8Array {
  const writer = new BinaryWriter(binaryV2Length(raw));
  // L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary Format:
  // L402 uses V2 binary macaroons. The current spec table conflicts with
  // Aperture's gopkg.in/macaroon.v2 dependency for caveat id/vid tags, so this
  // private codec targets the Aperture/go-macaroon layout documented in
  // docs/protocol-compatibility.md.
  writer.byte(2);
  writer.field(FIELD_IDENTIFIER, raw.identifier);
  writer.byte(FIELD_EOS);
  for (const caveat of raw.caveats) {
    writer.field(FIELD_IDENTIFIER, caveat);
    writer.byte(FIELD_EOS);
  }
  writer.byte(FIELD_EOS);
  writer.field(FIELD_SIGNATURE, raw.signature);
  return writer.bytes;
}

function binaryV2Length(raw: RawMacaroon): number {
  let length = 1;
  length += fieldLength(raw.identifier);
  length += 1;
  for (const caveat of raw.caveats) {
    length += fieldLength(caveat);
    length += 1;
  }
  length += 1;
  length += fieldLength(raw.signature);
  return length;
}

function fieldLength(bytes: Uint8Array): number {
  return 1 + uvarintLength(bytes.length) + bytes.length;
}

function uvarintLength(value: number): number {
  assertUvarint(value);
  let length = 1;
  let remaining = value;
  while (remaining >= 0x80) {
    length++;
    remaining >>>= 7;
  }
  return length;
}

function assertRawMacaroon(raw: RawMacaroon): void {
  assertLength(raw.identifier, IDENTIFIER_V0_LENGTH, "identifier");
  assertLength(raw.signature, SIGNATURE_LENGTH, "signature");
}

function assertLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new RangeError(`${label} must be ${String(expected)} bytes, got ${String(bytes.length)}`);
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

class BinaryWriter {
  private readonly buffer: Uint8Array;
  private offset = 0;

  constructor(length: number) {
    this.buffer = new Uint8Array(length);
  }

  byte(byte: number): void {
    this.buffer[this.offset] = byte;
    this.offset++;
  }

  field(tag: number, bytes: Uint8Array): void {
    this.byte(tag);
    this.uvarint(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  uvarint(value: number): void {
    assertUvarint(value);
    let remaining = value;
    while (remaining >= 0x80) {
      this.byte((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.byte(remaining);
  }

  get bytes(): Uint8Array {
    return this.buffer;
  }
}

function assertUvarint(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`varint ${String(value)} out of range`);
  }
}
