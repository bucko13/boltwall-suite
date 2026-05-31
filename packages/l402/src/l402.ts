import { bytesToHex, hexToBytes32 } from "@boltwall/internal";

import { serializeCaveat, type Caveat } from "./caveats";
import {
  buildAuthenticateHeaders,
  buildAuthorizationHeader,
  parseAuthenticateHeader,
  parseAuthorizationHeader,
  type AuthenticateHeaderCompatibility,
} from "./headers";
import { Identifier } from "./identifier";
import {
  addFirstPartyCaveat as addRawFirstPartyCaveat,
  decodeRaw,
  encodeRaw,
  inspectMacaroon as inspectMacaroonValue,
  verifyMacaroon,
  verifyPreimage,
  VerificationFailureReason,
  type MacaroonInspection,
  type VerifyMacaroonArgs,
  type VerifyMacaroonResult,
} from "./macaroon";

/**
 * Constructor input for an `L402` object.
 *
 * Most callers should use `L402.fromChallenge`, `L402.fromHeader`,
 * `L402.fromToken`, or `L402.fromMacaroon` so wire-format parsing stays in one
 * place.
 */
export interface L402Options {
  /** Base64 macaroon credential(s), in the same order used on the wire. */
  macaroons: string | string[];
  /** Optional BOLT 11 invoice from the L402 challenge. */
  invoice?: string;
  /** Optional 32-byte payment hash as hex or bytes. */
  paymentHash?: string | Uint8Array;
  /** Optional 32-byte payment preimage as hex. */
  paymentPreimage?: string;
  /** Creation timestamp in milliseconds since the Unix epoch. */
  timeCreated?: number;
}

/** Serialization options for `L402#toToken` and `L402#toPendingToken`. */
export interface L402TokenOptions {
  /** Emit the legacy `LSAT` Authorization scheme instead of `L402`. */
  legacy?: boolean;
}

/** Serialization options for `L402#toChallenge`. */
export interface L402ChallengeOptions {
  /** Emit the legacy `LSAT` WWW-Authenticate scheme. */
  legacy?: boolean;
  /** Explicit single-scheme challenge mode; dual challenges need the functional helper. */
  compatibility?: Exclude<AuthenticateHeaderCompatibility, "dual">;
}

/** Serialization options for `L402#toAuthenticateHeaders`. */
export interface L402AuthenticateHeadersOptions {
  /**
   * Challenge compatibility mode.
   *
   * Defaults to `"dual"` so server object workflows emit `LSAT` first and
   * `L402` second, as recommended by the
   * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
   * §10.
   */
  compatibility?: AuthenticateHeaderCompatibility;
}

/**
 * Verification options for `L402#verify`.
 *
 * The object supplies its macaroons and attached preimage. Pass `preimage` here
 * to verify against a different preimage without mutating the object.
 */
export type L402VerifyOptions = Omit<VerifyMacaroonArgs, "macaroons" | "preimage"> & {
  /** Override the object's attached payment preimage. */
  preimage?: VerifyMacaroonArgs["preimage"];
};

function normalizeMacaroons(macaroons: string | string[]): string[] {
  const normalized = Array.isArray(macaroons) ? macaroons : [macaroons];
  if (normalized.length === 0) {
    throw new Error("empty-macaroons");
  }
  for (const macaroon of normalized) {
    if (macaroon.length === 0) {
      throw new Error("empty-macaroon");
    }
  }
  return normalized;
}

function parsePossiblyPendingToken(token: string): {
  macaroons: string[];
  paymentPreimage?: string;
} {
  const separator = token.lastIndexOf(":");
  if (separator === token.length - 1) {
    const prefix = token.slice(0, separator);
    const trimmedPrefix = prefix.trim();
    const firstSpace = /\s/.exec(trimmedPrefix);
    if (firstSpace === null) {
      if (/^(L402|LSAT)$/i.test(trimmedPrefix)) {
        throw new Error("empty-macaroons");
      }
      throw new Error("missing-scheme");
    }
    const scheme = trimmedPrefix.slice(0, firstSpace.index).toUpperCase();
    if (scheme !== "L402" && scheme !== "LSAT") {
      throw new Error("scheme-mismatch");
    }
    const macaroons = trimmedPrefix
      .slice(firstSpace.index)
      .trim()
      .split(",")
      .map((m) => m.trim());
    return { macaroons: normalizeMacaroons(macaroons) };
  }

  const parsed = parseAuthorizationHeader(token);
  return {
    macaroons: parsed.macaroons,
    paymentPreimage: parsed.preimage,
  };
}

function challengeIdentity(challenge: { macaroon: string; invoice: string }): string {
  return `${challenge.macaroon}\u0000${challenge.invoice}`;
}

function assertMacaroonIndex(macaroons: string[], index: number): string {
  const macaroon = macaroons[index];
  if (macaroon === undefined) {
    throw new RangeError("macaroon-index-out-of-range");
  }
  return macaroon;
}

function encodeCaveatInput(caveat: Caveat | string): Uint8Array {
  const text = typeof caveat === "string" ? caveat : serializeCaveat(caveat);
  return new TextEncoder().encode(text);
}

function parseValidUntil(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("invalid-valid-until");
  }
  return timestamp;
}

function parseExpirationUnixMs(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("invalid-expiration");
  }
  const unixMs = Number(value);
  if (!Number.isSafeInteger(unixMs)) {
    throw new Error("invalid-expiration");
  }
  return unixMs;
}

/**
 * L402-native compatibility facade for the useful legacy `lsat-js` object
 * workflow.
 *
 * This class intentionally delegates all HTTP wire parsing/serialization to
 * the functional helpers in this package. It exists for source migration from
 * `Lsat.fromToken(...)` / `Lsat#toToken()` style code, while preserving current
 * L402 defaults: paid credential emission uses the `L402` scheme unless
 * `{ legacy: true }` is requested. Pending objects can parse legacy
 * trailing-colon tokens for migration state, but `toToken()` emits only paid
 * Authorization credentials. Use `toPendingToken()` when a migration workflow
 * needs to round-trip an unpaid object state that is not a valid retry
 * credential.
 *
 * Spec references:
 * - [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
 *   sections 5 and 10: Authorization / WWW-Authenticate grammar and LSAT/L402
 *   backwards compatibility.
 * - [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 *   Identifier Structure and Verification: payment hash extraction and
 *   `sha256(preimage) == payment_hash` validation.
 *
 * @example
 * // Parse a challenge, attach the paid preimage, then emit the Authorization token.
 * const l402 = L402.fromChallenge(wwwAuthenticateHeader);
 * l402.setPreimage(preimageHex);
 * const authorization = l402.toToken(); // "L402 <macaroon>:<preimage>"
 */
export class L402 {
  readonly macaroons: string[];
  invoice?: string;
  paymentHash?: Uint8Array;
  paymentPreimage?: string;
  readonly timeCreated: number;

  /**
   * Create an `L402` object from already-parsed macaroon data.
   *
   * This constructor does not parse headers or tokens. Use the static
   * constructors when starting from `WWW-Authenticate`, `Authorization`, or a
   * stored token string.
   *
   * @throws `empty-macaroons` when no macaroon is provided.
   * @throws `empty-macaroon` when a macaroon entry is blank.
   * @throws {RangeError} when `paymentHash` or `paymentPreimage` is not
   * 32-byte hex.
   * @throws `preimage-mismatch` when `paymentPreimage` is invalid for the
   * supplied `paymentHash`.
   * @param options - Parsed macaroon, invoice, hash, preimage, and timestamp.
   */
  constructor(options: L402Options) {
    this.macaroons = normalizeMacaroons(options.macaroons);
    this.timeCreated = options.timeCreated ?? Date.now();

    if (options.invoice !== undefined) {
      this.invoice = options.invoice;
    }
    if (options.paymentHash !== undefined) {
      this.paymentHash =
        typeof options.paymentHash === "string"
          ? hexToBytes32(options.paymentHash, "paymentHash")
          : options.paymentHash;
    }
    if (options.paymentPreimage !== undefined) {
      this.setPreimage(options.paymentPreimage);
    }
  }

  /** First macaroon in the credential set. */
  get macaroon(): string {
    return this.macaroons[0] ?? "";
  }

  /** Alias for `macaroon`, matching the old object workflow name. */
  get baseMacaroon(): string {
    return this.macaroon;
  }

  /** Attached payment hash as 64-character lowercase hex, when known. */
  get paymentHashHex(): string | undefined {
    return this.paymentHash === undefined ? undefined : bytesToHex(this.paymentHash);
  }

  /** Return `true` when no payment preimage is attached. */
  isPending(): boolean {
    return this.paymentPreimage === undefined;
  }

  /**
   * Check whether the attached preimage matches the attached payment hash.
   *
   * Returns `false` when either value is missing. This is a local consistency
   * check only; use `verify()` to verify signatures, caveats, and root-key
   * ownership.
   */
  isSatisfied(): boolean {
    if (this.paymentHash === undefined || this.paymentPreimage === undefined) {
      return false;
    }
    return verifyPreimage({
      paymentHash: this.paymentHash,
      preimage: this.paymentPreimage,
    });
  }

  /**
   * Attach a paid invoice preimage to this object.
   *
   * The preimage must be 32 bytes encoded as 64 hex characters. If the object
   * knows its payment hash, this method verifies `sha256(preimage)` before
   * storing it.
   *
   * @throws {RangeError} when the string is not a 32-byte hex preimage.
   * @throws `preimage-mismatch` when `paymentHash` is present and does not
   * match the preimage.
   * @param preimage - 32-byte Lightning payment preimage as 64 hex characters.
   *
   * @example
   * const l402 = L402.fromChallenge(wwwAuthenticate);
   * l402.setPreimage(preimageHex);
   */
  setPreimage(preimage: string): void {
    hexToBytes32(preimage, "preimage");
    if (this.paymentHash !== undefined) {
      const ok = verifyPreimage({ paymentHash: this.paymentHash, preimage });
      if (!ok) {
        throw new Error(VerificationFailureReason.PreimageMismatch);
      }
    }
    this.paymentPreimage = preimage;
  }

  /**
   * Serialize this paid object as an `Authorization` header value.
   *
   * The result includes the scheme, macaroon list, and preimage, so it can be
   * sent directly as the value of the `Authorization` header. New credentials
   * emit `L402`; pass `{ legacy: true }` to emit `LSAT`.
   *
   * @throws `missing-preimage` when the object is still pending.
   * @param options - Use `{ legacy: true }` to emit an `LSAT` credential.
   *
   * @example
   * const header = l402.toToken();
   * // "L402 <macaroon>:<preimage>"
   */
  toToken(options: L402TokenOptions = {}): string {
    if (this.paymentPreimage === undefined) {
      throw new Error("missing-preimage");
    }
    const tokenOptions: Parameters<typeof buildAuthorizationHeader>[0] = {
      macaroons: this.macaroons,
      preimage: this.paymentPreimage,
    };
    if (options.legacy !== undefined) {
      tokenOptions.legacy = options.legacy;
    }
    return buildAuthorizationHeader(tokenOptions);
  }

  /**
   * Alias for `toToken()` that makes header use explicit.
   *
   * @param options - Use `{ legacy: true }` to emit an `LSAT` credential.
   */
  toAuthorizationHeader(options: L402TokenOptions = {}): string {
    return this.toToken(options);
  }

  /**
   * Serialize an unpaid object as a trailing-colon pending token.
   *
   * This is for migration and HODL-settlement state. It is not a valid paid
   * retry credential under the standard Authorization grammar.
   *
   * @param options - Use `{ legacy: true }` to emit an `LSAT` pending token.
   */
  toPendingToken(options: L402TokenOptions = {}): string {
    const scheme = options.legacy === true ? "LSAT" : "L402";
    return `${scheme} ${this.macaroons.join(",")}:`;
  }

  /**
   * Serialize one `WWW-Authenticate` challenge value for this object.
   *
   * `toChallenge()` is the simple single-header workflow and defaults to the
   * current `L402` scheme. Use `toAuthenticateHeaders()` for server responses
   * that should emit both `LSAT` and `L402` challenges.
   *
   * @throws `missing-invoice` when no invoice is attached.
   * @param options - Select `L402` or legacy `LSAT` single-challenge emission.
   */
  toChallenge(options: L402ChallengeOptions = {}): string {
    if (this.invoice === undefined) {
      throw new Error("missing-invoice");
    }
    const compatibility =
      options.compatibility ?? (options.legacy === true ? "lsat-only" : "l402-only");
    return buildAuthenticateHeaders({
      macaroon: this.macaroon,
      invoice: this.invoice,
      compatibility,
    })[0]!;
  }

  /**
   * Serialize server challenge headers for a 402 response.
   *
   * Defaults to dual LSAT-first emission, as recommended by the L402 protocol
   * specification §10 for backwards compatibility. Each returned string is a
   * complete `WWW-Authenticate` header value.
   *
   * @throws `missing-invoice` when no invoice is attached.
   * @param options - Override dual emission with `l402-only` or `lsat-only`.
   *
   * @example
   * const headers = challenge.toAuthenticateHeaders();
   * // ["LSAT macaroon=\"...\", invoice=\"...\"", "L402 macaroon=\"...\", invoice=\"...\""]
   */
  toAuthenticateHeaders(options: L402AuthenticateHeadersOptions = {}): string[] {
    if (this.invoice === undefined) {
      throw new Error("missing-invoice");
    }
    return buildAuthenticateHeaders({
      macaroon: this.macaroon,
      invoice: this.invoice,
      compatibility: options.compatibility ?? "dual",
    });
  }

  /**
   * Attach or replace the BOLT 11 invoice and return this object.
   *
   * @param invoice - BOLT 11 payment request from a challenge.
   */
  addInvoice(invoice: string): this {
    this.invoice = invoice;
    return this;
  }

  /**
   * Decode one macaroon into identifier, caveat, and signature inspection data.
   *
   * This is an inspection helper, not an authorization decision. It does not
   * verify the macaroon signature or payment preimage.
   *
   * @throws `macaroon-index-out-of-range` when `index` does not exist.
   * @throws synchronously when the macaroon cannot be decoded.
   * @param index - Macaroon index to inspect. Defaults to the first macaroon.
   */
  inspectMacaroon(index = 0): MacaroonInspection {
    return inspectMacaroonValue(assertMacaroonIndex(this.macaroons, index));
  }

  /**
   * Return parsed caveats from one macaroon.
   *
   * Malformed caveat strings are skipped because they cannot be represented as
   * `Caveat` objects. Use `inspectMacaroon()` when diagnostics need the raw
   * malformed text.
   *
   * @param index - Macaroon index to read. Defaults to the first macaroon.
   */
  getCaveats(index = 0): Caveat[] {
    return this.inspectMacaroon(index).caveats.flatMap((caveat) =>
      caveat.parsed === null ? [] : [caveat.parsed],
    );
  }

  /**
   * Attenuate one macaroon by appending a first-party caveat.
   *
   * Pass a `Caveat` object for structured caveats or a string when preserving
   * an existing caveat representation. The method updates the selected macaroon
   * and returns this object.
   *
   * @throws `macaroon-index-out-of-range` when `index` does not exist.
   * @param caveat - Structured caveat or raw caveat string to append.
   * @param index - Macaroon index to attenuate. Defaults to the first macaroon.
   *
   * @example
   * l402.addFirstPartyCaveat(Caveat.validUntil({ iso: "2026-01-01T00:00:00.000Z" }));
   * l402.addFirstPartyCaveat("origin=https://example.com");
   */
  addFirstPartyCaveat(caveat: Caveat | string, index = 0): this {
    const macaroon = assertMacaroonIndex(this.macaroons, index);
    const raw = decodeRaw(macaroon);
    this.macaroons[index] = encodeRaw(addRawFirstPartyCaveat(raw, encodeCaveatInput(caveat)));
    return this;
  }

  /**
   * Check built-in expiration caveats on the first macaroon.
   *
   * Supports the preferred `valid-until=<ISO-8601>` caveat and the
   * legacy-compatible `expiration=<unix-ms>` caveat. This convenience check does
   * not replace full caveat verification with satisfiers.
   *
   * @throws `invalid-now` when the comparison date is invalid.
   * @throws `invalid-valid-until` or `invalid-expiration` when an expiration
   * caveat is malformed.
   * @param now - Comparison time. Defaults to the current time.
   */
  isExpired(now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) {
      throw new Error("invalid-now");
    }

    return this.getCaveats().some((caveat) => {
      if (caveat.condition === "valid-until") {
        return nowMs >= parseValidUntil(caveat.value);
      }
      if (caveat.condition === "expiration") {
        return nowMs >= parseExpirationUnixMs(caveat.value);
      }
      return false;
    });
  }

  /**
   * Verify this object's macaroons with the package verifier.
   *
   * The object supplies `macaroons` and uses its attached preimage unless
   * `options.preimage` overrides it. Verification returns `{ ok: true }` or a
   * typed failure reason instead of throwing for authorization failures.
   *
   * @param options - Root key store, satisfiers, request context, and optional
   * preimage override.
   *
   * @example
   * const result = await l402.verify({
   *   rootKeyStore,
   *   satisfiers: [validUntilSatisfier()],
   *   context: { now: new Date() },
   * });
   */
  async verify(options: L402VerifyOptions): Promise<VerifyMacaroonResult> {
    const { preimage, ...rest } = options;
    const args: VerifyMacaroonArgs = {
      ...rest,
      macaroons: this.macaroons,
    };
    if (preimage !== undefined) {
      args.preimage = preimage;
    } else if (this.paymentPreimage !== undefined) {
      args.preimage = this.paymentPreimage;
    }
    return verifyMacaroon(args);
  }

  /**
   * Return JSON-safe inspectable state.
   *
   * The payment preimage is intentionally omitted: L402 credentials are bearer
   * tokens whose macaroon/preimage material is cleartext in HTTP headers and
   * must be protected per the
   * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
   * §9.1 Transport Security.
   */
  toJSON(): {
    macaroons: string[];
    invoice?: string;
    paymentHash?: string;
    timeCreated: number;
    isPending: boolean;
    isSatisfied: boolean;
  } {
    const json: {
      macaroons: string[];
      invoice?: string;
      paymentHash?: string;
      timeCreated: number;
      isPending: boolean;
      isSatisfied: boolean;
    } = {
      macaroons: this.macaroons,
      timeCreated: this.timeCreated,
      isPending: this.isPending(),
      isSatisfied: this.isSatisfied(),
    };
    if (this.invoice !== undefined) {
      json.invoice = this.invoice;
    }
    if (this.paymentHashHex !== undefined) {
      json.paymentHash = this.paymentHashHex;
    }
    return json;
  }

  /**
   * Parse an `Authorization` header value or pending token into an `L402`.
   *
   * Accepts current `L402` and legacy `LSAT` scheme names. A trailing-colon
   * pending token is accepted for migration state; paid credentials attach the
   * decoded preimage.
   *
   * @throws parser errors from `parseAuthorizationHeader`, such as
   * `scheme-mismatch`, `missing-colon`, or `invalid-preimage-hex`.
   * @param token - `Authorization` header value or pending token string.
   * @param invoice - Optional BOLT 11 invoice to attach to the object.
   *
   * @example
   * const l402 = L402.fromToken("L402 <macaroon>:<preimage>");
   */
  static fromToken(token: string, invoice?: string): L402 {
    const parsed = parsePossiblyPendingToken(token);
    const options: L402Options = {
      macaroons: parsed.macaroons,
    };
    if (invoice !== undefined) {
      options.invoice = invoice;
    }
    if (parsed.paymentPreimage !== undefined) {
      options.paymentPreimage = parsed.paymentPreimage;
    }
    return new L402(options);
  }

  /**
   * Build an `L402` object from a base64 macaroon and optional invoice.
   *
   * The macaroon identifier is decoded immediately so `paymentHash` is
   * available for `setPreimage()` and `isSatisfied()`.
   *
   * @throws synchronously when the macaroon or identifier cannot be decoded.
   * @param macaroon - Base64-encoded L402 macaroon.
   * @param invoice - Optional BOLT 11 invoice to attach to the object.
   */
  static fromMacaroon(macaroon: string, invoice?: string): L402 {
    const identifier = Identifier.fromMacaroon(macaroon);
    const options: L402Options = {
      macaroons: macaroon,
      paymentHash: identifier.paymentHash,
    };
    if (invoice !== undefined) {
      options.invoice = invoice;
    }
    return new L402(options);
  }

  /**
   * Parse a `WWW-Authenticate` challenge into an `L402` object.
   *
   * Accepts a complete `WWW-Authenticate` value, a bare challenge body, or an
   * array of repeated header values. Identical dual `LSAT` and `L402`
   * challenges collapse into one logical object.
   *
   * @throws `ambiguous-challenge` when repeated challenges contain different
   * macaroon or invoice values.
   * @param challenge - Complete header value, bare challenge body, or repeated
   * header values.
   */
  static fromChallenge(challenge: string | string[]): L402 {
    if (Array.isArray(challenge)) {
      return L402.fromHeader(challenge);
    }
    const header = /^(L402|LSAT)\s/i.test(challenge) ? challenge : `L402 ${challenge}`;
    return L402.fromHeader(header);
  }

  /**
   * Parse one or more `WWW-Authenticate` header values into an `L402` object.
   *
   * This is the strict header form of `fromChallenge()`. It accepts current
   * `L402`, legacy `LSAT`, repeated headers, and folded dual challenges.
   * Identical dual challenges collapse into one object.
   *
   * @throws `empty-header` when no challenge is present.
   * @throws `ambiguous-challenge` when repeated challenges conflict.
   * @throws parser errors from `parseAuthenticateHeader`, such as
   * `missing-macaroon`, `missing-invoice`, or `scheme-mismatch`.
   * @param header - One `WWW-Authenticate` value or repeated header values.
   *
   * @example
   * const l402 = L402.fromHeader(response.headers.get("www-authenticate") ?? "");
   */
  static fromHeader(header: string | string[]): L402 {
    const parsedChallenges = parseAuthenticateHeader(header);
    const [parsed] = parsedChallenges;
    if (parsed === undefined) {
      throw new Error("empty-header");
    }

    const firstIdentity = challengeIdentity(parsed);
    for (const challenge of parsedChallenges.slice(1)) {
      if (challengeIdentity(challenge) !== firstIdentity) {
        throw new Error("ambiguous-challenge");
      }
    }

    return new L402({
      macaroons: parsed.macaroon,
      invoice: parsed.invoice,
    });
  }
}
