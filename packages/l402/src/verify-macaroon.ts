import { timingSafeEqual } from "@boltwall/internal";

import { parseCaveat, type Caveat } from "./caveats";
import { decodeRaw, verifyRawSignature } from "./internal/macaroon";
import type { RootKeyStore } from "./root-key-store";
import type { CaveatContext, CaveatSatisfier } from "./satisfiers";
import {
  VerificationFailurePrefix,
  VerificationFailureReason,
  type VerificationFailureReasonValue,
} from "./verification-failure";
import { verifyPreimage } from "./verify-preimage";

const IDENTIFIER_V0_LENGTH = 66;
const PAYMENT_HASH_LENGTH = 32;
const TOKEN_ID_LENGTH = 32;

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
      return { ok: false, reason: `caveat-rejected:${condition}` };
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
