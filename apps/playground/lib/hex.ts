/**
 * Hex/byte conversion helpers shared across playground panels and tests.
 *
 * Single source for the encoders that were previously copy-pasted into each
 * panel. Browser-safe (no `Buffer`, no `node:*` imports).
 */

/** Encode a byte array as a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Decode a hex string into a byte array.
 *
 * Trims surrounding whitespace and lowercases before decoding. Throws on
 * odd-length input or non-hex characters.
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.trim().toLowerCase();
  if (cleaned.length % 2 !== 0) throw new Error("Odd-length hex");
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const b = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(b)) throw new Error("Invalid hex char");
    bytes[i] = b;
  }
  return bytes;
}
