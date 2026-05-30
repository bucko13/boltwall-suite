import { base64ToBytes } from "./internal/base64";

/**
 * Decoded v0 L402 macaroon identifier fields.
 *
 * Plain data shape used by minting and verification. Use the {@link Identifier}
 * value class when you want decode/encode behavior attached to these fields.
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
const TOKEN_ID_LENGTH = 32;

/**
/**
 * Value class for the v0 L402 macaroon identifier
 * (`uint16 version || 32-byte payment_hash || 32-byte token_id`).
 *
 * Wraps the raw {@link MacaroonIdentifierV0} fields with decode/encode behavior.
 * Always uses `Uint8Array` (never Node's `Buffer`) so it is browser- and
 * edge-safe, and copies its byte fields at the boundary so the instance is
 * immutable by reference.
 *
 * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format defines
 * the 66-byte big-endian identifier embedded in every L402 macaroon.
 *
 * @example
 * // Decode the identifier from a base64 macaroon coming off the wire.
 * const id = Identifier.fromMacaroon(macaroonB64);
 * id.version; // 0
 * id.paymentHash; // Uint8Array(32)
 *
 * @example
 * // Build an identifier and serialize it to the 66-byte binary layout.
 * const id = new Identifier({ version: 0, paymentHash, tokenId });
 * const bytes = id.toBytes(); // Uint8Array(66)
 */
export class Identifier implements MacaroonIdentifierV0 {
  readonly version: 0;
  readonly paymentHash: Uint8Array;
  readonly tokenId: Uint8Array;

  /**
   * Build an identifier from its v0 fields.
   *
   * Throws `unsupported-identifier-version` for non-zero versions and
   * `RangeError` if `paymentHash` or `tokenId` is not exactly 32 bytes — the
   * binary layout is fixed-width, so a wrong length cannot be encoded.
   *
   * @example
   * const id = new Identifier({ version: 0, paymentHash, tokenId });
   */
  constructor(fields: MacaroonIdentifierV0) {
    if (fields.version !== 0) {
      throw new Error("unsupported-identifier-version");
    }
    assertLength(fields.paymentHash, HASH_LENGTH, "paymentHash");
    assertLength(fields.tokenId, TOKEN_ID_LENGTH, "tokenId");
    this.version = 0;
    this.paymentHash = fields.paymentHash.slice();
    this.tokenId = fields.tokenId.slice();
  }

  /**
   * Decode a base64-encoded L402 macaroon and wrap its v0 identifier.
   *
   * Reads the identifier field out of the V2 binary envelope without verifying
   * the signature or preimage. Throws the same short error codes as the
   * package-internal decoder on malformed input.
   *
   * @example
   * const id = Identifier.fromMacaroon(macaroonB64);
   * id.paymentHash; // Uint8Array(32)
   */
  static fromMacaroon(macaroon: string): Identifier {
    return new Identifier(decodeIdentifierFields(macaroon));
  }

  /**
   * Serialize this identifier to its 66-byte v0 binary layout.
   *
   * Spec: L402 macaroon-spec.md §Identifier Structure — all multi-byte integers
   * are big-endian; version 0 is two zero bytes followed by the 32-byte payment
   * hash and 32-byte token id. This is the inverse of {@link Identifier.fromMacaroon}'s
   * identifier extraction and matches the bytes `mintMacaroon` HMACs over.
   *
   * @example
   * const bytes = Identifier.fromMacaroon(macaroonB64).toBytes();
   * bytes.length; // 66
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(V0_IDENTIFIER_LENGTH);
    // Big-endian uint16 version per the spec; version 0 is two zero bytes.
    new DataView(bytes.buffer).setUint16(0, this.version, false);
    bytes.set(this.paymentHash, 2);
    bytes.set(this.tokenId, 2 + HASH_LENGTH);
    return bytes;
  }
}

/**
 * Decode the v0 identifier fields from a base64 macaroon. Internal helper
 * shared by {@link Identifier.fromMacaroon} and the macaroon inspector.
 */
export function decodeIdentifierFields(macaroon: string): MacaroonIdentifierV0 {
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

function assertLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new RangeError(`${label} must be ${String(expected)} bytes, got ${String(bytes.length)}`);
  }
}
