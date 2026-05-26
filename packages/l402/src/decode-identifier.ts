/**
 * Decoded v0 L402 macaroon identifier.
 */
export interface MacaroonIdentifierV0 {
  /** Identifier version. Version 0 is the only supported layout today. */
  version: 0;
  /** 32-byte Lightning invoice payment hash. */
  paymentHash: Uint8Array;
  /** 32-byte random token id, stable across credential rotations. */
  tokenId: Uint8Array;
}

const V2_MARKER = 0x02;
const END_OF_SECTION = 0x00;
const IDENTIFIER_TAG = 0x02;
const V0_IDENTIFIER_LENGTH = 66;
const HASH_LENGTH = 32;

/**
 * Decode a base64-encoded L402 macaroon and return its v0 identifier fields.
 *
 * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format
 * defines a 66-byte big-endian identifier:
 * `uint16 version || 32-byte payment_hash || 32-byte token_id`.
 *
 * Throws synchronously on malformed input using short error codes:
 * `invalid-macaroon-base64`, `invalid-macaroon-v2`, `missing-identifier`,
 * `truncated-varint`, `varint-too-large`, `truncated-field`,
 * `invalid-identifier-length`, or `unsupported-identifier-version`.
 */
export function decodeIdentifier(macaroon: string): MacaroonIdentifierV0 {
  const bytes = base64ToBytes(macaroon);
  const identifier = extractV2Identifier(bytes);

  if (identifier.byteLength !== V0_IDENTIFIER_LENGTH) {
    throw new Error("invalid-identifier-length");
  }

  // The L402 macaroon spec's Identifier section requires all multi-byte
  // integer fields to be big-endian. `false` selects big-endian here.
  const version = new DataView(
    identifier.buffer,
    identifier.byteOffset,
    identifier.byteLength,
  ).getUint16(0, false);
  if (version !== 0) {
    throw new Error("unsupported-identifier-version");
  }

  return {
    version: 0,
    paymentHash: identifier.slice(2, 2 + HASH_LENGTH),
    tokenId: identifier.slice(2 + HASH_LENGTH),
  };
}

function base64ToBytes(input: string): Uint8Array {
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

function extractV2Identifier(bytes: Uint8Array): Uint8Array {
  // L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary Format:
  // the leading byte is the V2 version and the header identifier uses tag
  // 0x02 in Aperture's go-macaroon codec; see docs/protocol-compatibility.md.
  if (bytes[0] !== V2_MARKER) {
    throw new Error("invalid-macaroon-v2");
  }

  let offset = 1;
  while (offset < bytes.length) {
    const tag = bytes[offset];
    offset++;
    if (tag === END_OF_SECTION) {
      break;
    }
    if (tag === undefined) {
      break;
    }

    const length = readVarint(bytes, offset);
    offset = length.nextOffset;
    if (offset + length.value > bytes.length) {
      throw new Error("truncated-field");
    }

    const field = bytes.slice(offset, offset + length.value);
    offset += length.value;
    if (tag === IDENTIFIER_TAG) {
      return field;
    }
  }

  throw new Error("missing-identifier");
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; nextOffset: number } {
  let value = 0;
  let shift = 0;
  let i = offset;

  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte === undefined) {
      break;
    }
    value += (byte & 0x7f) * 2 ** shift;
    i++;

    if ((byte & 0x80) === 0) {
      return { value, nextOffset: i };
    }

    shift += 7;
    if (shift > 28) {
      throw new Error("varint-too-large");
    }
  }

  throw new Error("truncated-varint");
}
