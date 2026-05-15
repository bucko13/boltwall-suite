import { bytesToHex } from "@boltwall/internal";

/**
 * Storage contract for macaroon root keys indexed by token id.
 *
 * Root keys are bearer-secret material used by L402 macaroon verification.
 * Implementations must not log, serialize, or expose keys except through
 * explicit `get` calls. The in-memory implementation copies byte arrays at
 * the boundary so callers cannot mutate stored keys by reference.
 */
export interface RootKeyStore {
  /**
   * Return the root key for `tokenId`, or `null` when no key is known.
   */
  get(tokenId: Uint8Array): Promise<Uint8Array | null>;

  /**
   * Store or replace the root key for `tokenId`.
   */
  put(tokenId: Uint8Array, rootKey: Uint8Array): Promise<void>;

  /**
   * Remove the root key for `tokenId`. Missing token ids are ignored.
   */
  delete(tokenId: Uint8Array): Promise<void>;
}

/**
 * Promise-based in-memory `RootKeyStore` for tests, demos, and single-process
 * deployments. Future SQL/Redis stores can implement the same interface.
 */
export class InMemoryRootKeyStore implements RootKeyStore {
  #keys = new Map<string, Uint8Array>();

  async get(tokenId: Uint8Array): Promise<Uint8Array | null> {
    const rootKey = this.#keys.get(bytesToHex(tokenId));
    return rootKey === undefined ? null : new Uint8Array(rootKey);
  }

  async put(tokenId: Uint8Array, rootKey: Uint8Array): Promise<void> {
    this.#keys.set(bytesToHex(tokenId), new Uint8Array(rootKey));
  }

  async delete(tokenId: Uint8Array): Promise<void> {
    this.#keys.delete(bytesToHex(tokenId));
  }
}

