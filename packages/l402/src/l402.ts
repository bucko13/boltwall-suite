import { bytesToHex, hexToBytes32 } from "@boltwall/internal";

import {
  buildAuthenticateHeaders,
  type AuthenticateHeaderCompatibility,
} from "./build-authenticate-headers";
import { buildAuthorizationHeader } from "./build-authorization-header";
import { decodeIdentifier } from "./decode-identifier";
import { parseAuthenticateHeader } from "./parse-authenticate-header";
import { parseAuthorizationHeader } from "./parse-authorization-header";
import { VerificationFailureReason } from "./verification-failure";
import { verifyPreimage } from "./verify-preimage";

/** Constructor input for the `L402` compatibility facade. */
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
 * - L402 protocol-specification.md sections 5 and 10: Authorization /
 *   WWW-Authenticate grammar and LSAT/L402 backwards compatibility.
 * - L402 macaroon-spec.md Identifier Structure and Verification: payment hash
 *   extraction and `sha256(preimage) == payment_hash` validation.
 */
export class L402 {
  readonly macaroons: string[];
  invoice?: string;
  paymentHash?: Uint8Array;
  paymentPreimage?: string;
  readonly timeCreated: number;

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

  get macaroon(): string {
    return this.macaroons[0] ?? "";
  }

  get baseMacaroon(): string {
    return this.macaroon;
  }

  get paymentHashHex(): string | undefined {
    return this.paymentHash === undefined ? undefined : bytesToHex(this.paymentHash);
  }

  isPending(): boolean {
    return this.paymentPreimage === undefined;
  }

  isSatisfied(): boolean {
    if (this.paymentHash === undefined || this.paymentPreimage === undefined) {
      return false;
    }
    return verifyPreimage({
      paymentHash: this.paymentHash,
      preimage: this.paymentPreimage,
    });
  }

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

  toPendingToken(options: L402TokenOptions = {}): string {
    const scheme = options.legacy === true ? "LSAT" : "L402";
    return `${scheme} ${this.macaroons.join(",")}:`;
  }

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
   * Return JSON-safe inspectable state.
   *
   * The payment preimage is intentionally omitted: L402 credentials are bearer
   * tokens whose macaroon/preimage material is cleartext in HTTP headers and
   * must be protected per L402 protocol-specification.md §9.1 Transport
   * Security.
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

  static fromMacaroon(macaroon: string, invoice?: string): L402 {
    const identifier = decodeIdentifier(macaroon);
    const options: L402Options = {
      macaroons: macaroon,
      paymentHash: identifier.paymentHash,
    };
    if (invoice !== undefined) {
      options.invoice = invoice;
    }
    return new L402(options);
  }

  static fromChallenge(challenge: string): L402 {
    const header = /^(L402|LSAT)\s/i.test(challenge) ? challenge : `L402 ${challenge}`;
    const parsed = parseAuthenticateHeader(header)[0];
    if (parsed === undefined) {
      throw new Error("empty-header");
    }
    return new L402({
      macaroons: parsed.macaroon,
      invoice: parsed.invoice,
    });
  }

  static fromHeader(header: string): L402 {
    return L402.fromChallenge(header);
  }
}
