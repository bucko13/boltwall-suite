import { createHmac } from "node:crypto";

import { hexToBytes } from "@boltwall/internal";
import type { RootKeyStore } from "@boltwall/l402";

/**
 * Environment variable carrying the proxy's root-key derivation secret.
 *
 * The value is a 64-character hex string encoding 32 bytes. It is a bearer
 * secret: provide it through a platform secret manager or injected environment
 * variable, never bake it into images or commit it to source control.
 */
export const PROXY_ROOT_KEY_ENV = "BOLTWALL_PROXY_ROOT_KEY";

/**
 * Restart-safe `RootKeyStore` that derives per-token root keys from one
 * deployment secret.
 *
 * Each root key is `HMAC-SHA256(secret, tokenId)`, so any proxy instance
 * holding the same secret derives the same key for a given token id. That
 * makes issued credentials survive process restarts, serverless cold starts,
 * and horizontal scaling without shared storage: every instance can mint and
 * verify independently.
 *
 * Trade-off: derivation has no per-token state, so individual credentials
 * cannot be revoked (L402 macaroon-spec.md §Revocation deletes the stored
 * root key, which has no effect here). Rotating the deployment secret
 * invalidates every credential minted by the proxy. Deployments that need
 * per-credential revocation should use a persistent keyed store instead.
 *
 * @example
 * ```ts
 * import { createProxy, DerivedRootKeyStore } from "@boltwall/proxy";
 *
 * const app = createProxy({
 *   targetUrl: "https://api.example.com",
 *   backend,
 *   rootKeyStore: new DerivedRootKeyStore(process.env.BOLTWALL_PROXY_ROOT_KEY!),
 *   defaultPrice: 1_000n,
 * });
 * ```
 */
export class DerivedRootKeyStore implements RootKeyStore {
  readonly #secret: Uint8Array;

  /**
   * @param secret - 64-character hex string encoding the 32-byte derivation
   *   secret. Surrounding whitespace is tolerated.
   * @throws {RangeError} when the secret is not 32 bytes of hex. The message
   *   never includes the provided value.
   */
  constructor(secret: string) {
    const trimmed = secret.trim();
    if (!/^[0-9a-fA-F]{64}$/u.test(trimmed)) {
      throw new RangeError("root-key secret must be a 64-character hex string encoding 32 bytes");
    }
    this.#secret = hexToBytes(trimmed);
  }

  /**
   * Derive the root key for `tokenId`.
   *
   * L402 macaroon-spec.md §Identifier Structure / §Minting require a
   * server-side 32-byte root key per token id; this store derives it as
   * `HMAC-SHA256(secret, tokenId)` instead of looking it up, so a key exists
   * for every token id and minting never writes.
   */
  async get(tokenId: Uint8Array): Promise<Uint8Array | null> {
    return new Uint8Array(createHmac("sha256", this.#secret).update(tokenId).digest());
  }

  /**
   * No-op: keys are derived from the deployment secret, so there is no
   * mutable per-token write surface. Minting takes the `get` path because a
   * derived key exists for every token id.
   */
  async put(): Promise<void> {
    // Intentionally empty; see the method doc.
  }

  /**
   * No-op: L402 macaroon-spec.md §Revocation deletes the stored root key,
   * but derived keys have no stored state. Rotate the deployment secret to
   * invalidate every credential minted by this proxy.
   */
  async delete(): Promise<void> {
    // Intentionally empty; see the method doc.
  }
}
