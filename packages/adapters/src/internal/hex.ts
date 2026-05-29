import { hexToBytes32 } from "@boltwall/internal";

/**
 * Shared hex normalization for the Lightning backend adapters.
 *
 * Each adapter throws its own structured error type with its own messages, so
 * these helpers accept error factories rather than throwing a shared error. The
 * actual 32-byte decode/validate is delegated to `@boltwall/internal`'s
 * `hexToBytes32`, removing the per-adapter copies of that logic.
 */

const HEX_ALPHABET_RE = /^[0-9a-f]+$/;

/**
 * Lowercase `value` and assert it is a non-empty hex string.
 *
 * @throws whatever `notHex` returns when `value` is not hex encoded.
 * @example
 * ```ts
 * normalizeHexString("00AB", () => new Error("not hex")); // "00ab"
 * ```
 */
export function normalizeHexString(value: string, notHex: () => Error): string {
  const normalized = value.toLowerCase();
  if (!HEX_ALPHABET_RE.test(normalized)) {
    throw notHex();
  }
  return normalized;
}

/**
 * Lowercase `value` and assert it decodes to exactly 32 bytes of hex.
 *
 * Alphabet and length validation are delegated to `@boltwall/internal`. Callers
 * supply a separate factory for each failure mode so adapter error messages are
 * preserved: `notHex` for a bad hex alphabet and `notLength` for a hex string of
 * the wrong length.
 *
 * @throws whatever `notHex` / `notLength` return on the respective failure.
 * @example
 * ```ts
 * normalizeHash32(
 *   hash64HexChars,
 *   () => new Error("not hex"),
 *   () => new Error("not 32 bytes"),
 * );
 * ```
 */
export function normalizeHash32(
  value: string,
  notHex: () => Error,
  notLength: () => Error,
): string {
  const normalized = normalizeHexString(value, notHex);
  try {
    hexToBytes32(normalized);
  } catch {
    throw notLength();
  }
  return normalized;
}
