/**
 * Runtime-neutral hex/byte conversion helpers.
 *
 * Browser-safe (no `Buffer`, no `node:*` imports). Used across `@boltwall/l402`,
 * `@boltwall/middleware`, and `@boltwall/adapters` to remove four near-identical
 * copies of the same encoders.
 */

const HEX_RE = /^[0-9a-fA-F]*$/;
const PAYMENT_HASH_HEX_LENGTH = 64; // 32 bytes

/**
 * Encode a byte array as a lowercase hex string.
 *
 * @example bytesToHex(new Uint8Array([0xab, 0xcd])) // "abcd"
 */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Decode a hex string into a byte array.
 *
 * Accepts upper and lower case. Validates even length and the hex alphabet;
 * decoding malformed input throws `RangeError` rather than returning a partial
 * or corrupt result.
 *
 * @throws {RangeError} when `hex.length` is odd or any character is non-hex.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new RangeError("hex string must have an even number of characters");
  }
  if (!HEX_RE.test(hex)) {
    throw new RangeError("hex string contains non-hex characters");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    // Inline charCode decode avoids `parseInt(hex.slice(...), 16)` substring
    // allocations on the hot path; identical numerics to parseInt.
    const hi = hex.charCodeAt(i * 2);
    const lo = hex.charCodeAt(i * 2 + 1);
    const hiV = hi <= 57 ? hi - 48 : (hi & 0x0f) + 9;
    const loV = lo <= 57 ? lo - 48 : (lo & 0x0f) + 9;
    out[i] = (hiV << 4) | loV;
  }
  return out;
}

/**
 * Decode a hex string into a 32-byte array, rejecting any length other than
 * exactly 64 hex characters.
 *
 * Used wherever a payment hash, preimage, token id, or other 32-byte secret
 * arrives as hex from a credential or identifier.
 *
 * @param hex - Hex-encoded input.
 * @param label - Optional label woven into error messages (defaults to `"value"`).
 * @throws {RangeError} when the input is not exactly 64 hex characters.
 */
export function hexToBytes32(hex: string, label = "value"): Uint8Array {
  if (hex.length !== PAYMENT_HASH_HEX_LENGTH) {
    throw new RangeError(`${label} must be 32 bytes`);
  }
  if (!HEX_RE.test(hex)) {
    throw new RangeError(`${label} must be hex`);
  }
  return hexToBytes(hex);
}
