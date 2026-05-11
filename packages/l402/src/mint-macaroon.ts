import { serializeCaveat, type Caveat } from "./caveats";
import type { MacaroonIdentifierV0 } from "./decode-identifier";
import { encodeRaw, mintRaw } from "./internal/macaroon";

const ROOT_KEY_LENGTH = 32;
const PAYMENT_HASH_LENGTH = 32;
const TOKEN_ID_LENGTH = 32;
const IDENTIFIER_V0_LENGTH = 66;

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
  caveats?: Caveat[];
}

/**
 * Mint a base64-encoded L402 macaroon from a root key, v0 identifier, and
 * optional first-party caveats.
 *
 * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format and
 * §Minting require a 66-byte identifier encoded as
 * `uint16 version || 32-byte payment_hash || 32-byte token_id`, then an
 * HMAC-SHA256 chain over the identifier and each UTF-8 caveat string. The raw
 * HMAC and V2 binary assembly are delegated to the internal macaroon codec.
 *
 * Throws `RangeError` if the root key, payment hash, or token id length is not
 * exactly 32 bytes.
 */
export function mintMacaroon(args: MintMacaroonArgs): string {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  const identifier = encodeIdentifier(args.identifier);
  const caveats = (args.caveats ?? []).map((caveat) =>
    new TextEncoder().encode(serializeCaveat(caveat)),
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

function assertLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new RangeError(`${label} must be ${String(expected)} bytes, got ${String(bytes.length)}`);
  }
}
