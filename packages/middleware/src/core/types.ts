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
  /** Service name for the macaroon identifier (passed as a services caveat). */
  service: string;
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
   * Optional caveats or per-request caveat resolvers appended to every
   * minted macaroon.
   */
  caveats?: (Caveat | ((req: Request) => Caveat | Promise<Caveat>))[];
  /**
   * WWW-Authenticate scheme output mode.
   *
   * "dual" (default, recommended): emit LSAT first and L402 second.
   * L402 protocol-specification.md §10 — servers SHOULD emit dual challenges
   * with LSAT first for backwards compatibility with LSAT-only clients.
   */
  challengeCompatibility?: AuthenticateHeaderCompatibility;
  /** Optional human-readable memo for the Lightning invoice. */
  invoiceMemo?: (req: Request) => string;
  /** Caveat satisfiers registered for this middleware instance. */
  satisfiers?: CaveatSatisfier[];
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
