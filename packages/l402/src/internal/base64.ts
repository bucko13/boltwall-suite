/**
 * Shared base64 codec for L402 macaroon serialization.
 *
 * [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 * §Serialization Formats encodes the V2 binary macaroon as base64 for the
 * `Authorization`/`WWW-Authenticate` header and token forms. Both the macaroon
 * codec and the identifier decoder share this conversion.
 */

/**
 * Decode a base64 string into bytes.
 *
 * Throws `invalid-macaroon-base64` on malformed input.
 */
export function base64ToBytes(input: string): Uint8Array {
  try {
    const binary = atob(input);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    throw new Error("invalid-macaroon-base64");
  }
}

/**
 * Encode bytes into a base64 string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
