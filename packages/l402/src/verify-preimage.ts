import { hexToBytes, timingSafeEqual } from "@boltwall/internal";
import { sha256 } from "@noble/hashes/sha2.js";

const PAYMENT_HASH_LENGTH = 32;
const PREIMAGE_LENGTH = 32;

/**
 * Either a 32-byte `Uint8Array` or a 64-char hex string. Internal helpers
 * normalize both to `Uint8Array` at the function boundary.
 */
type Bytes32Input = Uint8Array | string;

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
 * `payment_hash` — i.e. that the bearer of this credential paid the
 * invoice the macaroon was minted against.
 *
 * Spec citation:
 * - L402 macaroon-spec, "Identifier" section: the v0 identifier embeds
 *   `payment_hash` (32 bytes). The credential carries `preimage` (32
 *   bytes); the verifier MUST check `sha256(preimage) === payment_hash`
 *   in constant time.
 *
 * Inputs may be `Uint8Array` (32 bytes) or hex `string` (64 chars,
 * case-insensitive). Both are normalized to `Uint8Array` at the boundary.
 *
 * Throws `RangeError` on length mismatch (length is not secret) and on
 * malformed hex strings; returns `false` for any other mismatch (do NOT
 * throw on cryptographic failure — surface that as a boolean to the
 * caller, who decides how to translate it into HTTP 401 / log lines).
 *
 * @example
 * verifyPreimage({
 *   paymentHash: "00112233...",
 *   preimage: "ffeeddcc...",
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
