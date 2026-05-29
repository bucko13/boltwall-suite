/**
 * Compare two byte arrays without short-circuiting on the first mismatch.
 *
 * Length is treated as public information and is checked up front. When the
 * lengths match, the loop reads every byte before returning.
 *
 * @example
 * timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2])) // true
 * timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3])) // false
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i]! ^ b[i]!;
  }

  return diff === 0;
}
