import type { LightningBackend } from "@boltwall/adapters";
import type {
  AuthenticateHeaderCompatibility,
  Caveat,
  CaveatSatisfier,
  L402CredentialFields,
  MacaroonIdentifierV0,
  RootKeyStore,
} from "@boltwall/l402";

import type { L402Error } from "./error.js";

export type { AuthenticateHeaderCompatibility };

export interface L402Config {
  /** Optional service name used to mint a `services=<name>:0` caveat. */
  service?: string;
  capabilities?: string[];
  /** Lightning backend (MockAdapter, LndAdapter, etc.). */
  backend: LightningBackend;
  /** Server-side root key store indexed by v0 token id. */
  rootKeyStore: RootKeyStore;
  /**
   * Invoice amount in millisatoshis. Supports a per-request resolver for
   * dynamic pricing (e.g., tiered by endpoint).
   */
  price: bigint | ((req: Request) => bigint | Promise<bigint>);
  /**
   * Optional dynamic access rate in sats per second.
   *
   * When set, each freshly minted challenge macaroon receives an additional
   * `valid-until` caveat whose duration is derived from the invoice amount:
   * `ceil((priceMsat / 1000) / rate)` seconds. The
   * [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
   * §Caveat Format governs the generated caveat shape.
   */
  rate?: number;
  /**
   * Enable HODL invoice authorization.
   *
   * Missing-credential requests must supply a 32-byte hex `paymentHash` in the
   * request body or query string. Held HODL invoices authorize access before
   * settlement; once settled, the HODL credential is expired. Standard L402 and
   * LSAT credentials still follow the
   * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
   * §5.2/§5.3.
   */
  hodl?: true;
  /**
   * Optional caveats or per-request caveat resolvers appended to every
   * minted macaroon.
   */
  caveats?: (Caveat | ((req: Request) => Caveat | Promise<Caveat>))[];
  /**
   * WWW-Authenticate scheme output mode.
   *
   * "dual" (default, recommended): emit LSAT first and L402 second.
   * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
   * §10 — servers SHOULD emit dual challenges with LSAT first for backwards
   * compatibility with LSAT-only clients.
   */
  challengeCompatibility?: AuthenticateHeaderCompatibility;
  /** Optional human-readable memo for the Lightning invoice. */
  invoiceMemo?: (req: Request) => string;
  /** Caveat satisfiers registered for this middleware instance. */
  satisfiers?: CaveatSatisfier[];
  /**
   * Allow cleartext `http:` requests.
   *
   * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
   * §9.1 requires TLS because L402 credentials are bearer credentials.
   * Loopback HTTP is allowed for local development; leave this disabled in
   * production and use it only for tests that do not cross a network boundary.
   */
  allowInsecureHttp?: boolean;
  /** Called after a credential is fully verified (payment confirmed). */
  onPaid?: (event: { credential: L402CredentialFields; req: Request }) => void | Promise<void>;
  /** Optional structured logger (pino-compatible). Defaults to a no-op. */
  logger?: MinimalLogger;
}

/** Minimal pino-compatible logger interface. */
export interface MinimalLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/**
 * No-op logger that discards every call.
 *
 * Use this as the {@link L402Config.logger} default when logging must be
 * explicitly disabled (e.g. tests, or hosts that forbid stdout writes); prefer
 * a real logger such as `defaultLogger` in production so credential redaction
 * and observability still apply.
 *
 * @example
 * ```ts
 * import { noopLogger } from "@boltwall/middleware";
 * const logger: MinimalLogger = noopLogger;
 * logger.info({ kind: "payment-required" }, "discarded");
 * ```
 */
export const noopLogger: MinimalLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

/** Request-scoped context returned on successful authorization. */
export interface L402RequestContext {
  /** Payment hash (hex) binding the credential to the Lightning invoice. */
  paymentHash: string;
  /** Decoded v0 macaroon identifier. */
  identifier: MacaroonIdentifierV0;
}

export type L402GateResult =
  | { ok: true; context: L402RequestContext }
  | { ok: false; response: Response; error: L402Error };
