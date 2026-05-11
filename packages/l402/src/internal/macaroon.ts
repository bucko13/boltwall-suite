import { timingSafeEqual } from "@boltwall/internal";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { importMacaroon } from "macaroon";

const ROOT_KEY_LENGTH = 32;
const IDENTIFIER_V0_LENGTH = 66;
const SIGNATURE_LENGTH = 32;
const FIELD_EOS = 0;
const FIELD_IDENTIFIER = 2;
const FIELD_SIGNATURE = 6;

export interface RawMacaroon {
  identifier: Uint8Array;
  caveats: Uint8Array[];
  signature: Uint8Array;
}

export function decodeRaw(macaroonB64: string): RawMacaroon {
  const macaroon = normalizeImportedMacaroon(importMacaroon(base64ToBytes(macaroonB64)));
  return rawFromLibraryMacaroon(macaroon);
}

export function encodeRaw(raw: RawMacaroon): string {
  assertRawMacaroon(raw);
  return bytesToBase64(encodeBinaryV2(raw));
}

export function mintRaw(args: {
  rootKey: Uint8Array;
  identifier: Uint8Array;
  caveats?: Uint8Array[];
}): RawMacaroon {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  assertLength(args.identifier, IDENTIFIER_V0_LENGTH, "identifier");
  const caveats = (args.caveats ?? []).map((caveat) => copyBytes(caveat));
  return {
    identifier: copyBytes(args.identifier),
    caveats,
    signature: computeSignature(args.rootKey, args.identifier, caveats),
  };
}

export function verifyRawSignature(args: { macaroon: RawMacaroon; rootKey: Uint8Array }): boolean {
  assertLength(args.rootKey, ROOT_KEY_LENGTH, "rootKey");
  assertRawMacaroon(args.macaroon);
  const expected = computeSignature(args.rootKey, args.macaroon.identifier, args.macaroon.caveats);
  return timingSafeEqual(expected, args.macaroon.signature);
}

export function addFirstPartyCaveat(macaroon: RawMacaroon, caveat: Uint8Array): RawMacaroon {
  assertRawMacaroon(macaroon);
  const nextCaveat = copyBytes(caveat);
  return {
    identifier: copyBytes(macaroon.identifier),
    caveats: [...macaroon.caveats.map((entry) => copyBytes(entry)), nextCaveat],
    signature: signNext(macaroon.signature, nextCaveat),
  };
}

function rawFromLibraryMacaroon(macaroon: {
  caveats: Array<{ identifier: Uint8Array; vid?: Uint8Array }>;
  identifier: Uint8Array;
  signature: Uint8Array;
}): RawMacaroon {
  const caveats = macaroon.caveats.map((caveat) => {
    if (caveat.vid !== undefined) {
      throw new Error("unsupported-third-party-caveat");
    }
    return copyBytes(caveat.identifier);
  });
  const raw = {
    identifier: copyBytes(macaroon.identifier),
    caveats,
    signature: copyBytes(macaroon.signature),
  };
  assertRawMacaroon(raw);
  return raw;
}

function normalizeImportedMacaroon(macaroon: ReturnType<typeof importMacaroon>): {
  caveats: Array<{ identifier: Uint8Array; vid?: Uint8Array }>;
  identifier: Uint8Array;
  signature: Uint8Array;
  exportBinary(): Uint8Array;
} {
  if (Array.isArray(macaroon)) {
    throw new Error("expected-single-macaroon");
  }
  return macaroon;
}

function computeSignature(
  rootKey: Uint8Array,
  identifier: Uint8Array,
  caveats: Uint8Array[],
): Uint8Array {
  // L402 macaroon-spec.md §HMAC Chain Construction and §Verification:
  // sig_0 = HMAC(root_key, identifier), then each first-party caveat is
  // chained as HMAC(previous_sig, caveat_id).
  let signature: Uint8Array = copyBytes(hmac(sha256, rootKey, identifier));
  for (const caveat of caveats) {
    signature = signNext(signature, caveat);
  }
  return signature;
}

function signNext(previousSignature: Uint8Array, caveat: Uint8Array): Uint8Array {
  assertLength(previousSignature, SIGNATURE_LENGTH, "signature");
  return copyBytes(hmac(sha256, previousSignature, caveat));
}

function encodeBinaryV2(raw: RawMacaroon): Uint8Array {
  const writer = new BinaryWriter(binaryV2Length(raw));
  // L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary Format:
  // L402 uses V2 binary macaroons. The upstream macaroon library encodes the
  // caveat id using the same identifier field tag used by gopkg.in/macaroon.v2.
  writer.byte(2);
  writer.field(FIELD_IDENTIFIER, raw.identifier);
  writer.byte(FIELD_EOS);
  for (const caveat of raw.caveats) {
    writer.field(FIELD_IDENTIFIER, caveat);
    writer.byte(FIELD_EOS);
  }
  writer.byte(FIELD_EOS);
  writer.field(FIELD_SIGNATURE, raw.signature);
  return writer.bytes;
}

function binaryV2Length(raw: RawMacaroon): number {
  let length = 1;
  length += fieldLength(raw.identifier);
  length += 1;
  for (const caveat of raw.caveats) {
    length += fieldLength(caveat);
    length += 1;
  }
  length += 1;
  length += fieldLength(raw.signature);
  return length;
}

function fieldLength(bytes: Uint8Array): number {
  return 1 + uvarintLength(bytes.length) + bytes.length;
}

function uvarintLength(value: number): number {
  assertUvarint(value);
  let length = 1;
  let remaining = value;
  while (remaining >= 0x80) {
    length++;
    remaining >>>= 7;
  }
  return length;
}

function assertRawMacaroon(raw: RawMacaroon): void {
  assertLength(raw.identifier, IDENTIFIER_V0_LENGTH, "identifier");
  assertLength(raw.signature, SIGNATURE_LENGTH, "signature");
}

function assertLength(bytes: Uint8Array, expected: number, label: string): void {
  if (bytes.length !== expected) {
    throw new RangeError(`${label} must be ${String(expected)} bytes, got ${String(bytes.length)}`);
  }
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return bytes.slice();
}

class BinaryWriter {
  private readonly buffer: Uint8Array;
  private offset = 0;

  constructor(length: number) {
    this.buffer = new Uint8Array(length);
  }

  byte(byte: number): void {
    this.buffer[this.offset] = byte;
    this.offset++;
  }

  field(tag: number, bytes: Uint8Array): void {
    this.byte(tag);
    this.uvarint(bytes.length);
    this.buffer.set(bytes, this.offset);
    this.offset += bytes.length;
  }

  uvarint(value: number): void {
    assertUvarint(value);
    let remaining = value;
    while (remaining >= 0x80) {
      this.byte((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.byte(remaining);
  }

  get bytes(): Uint8Array {
    return this.buffer;
  }
}

function assertUvarint(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`varint ${String(value)} out of range`);
  }
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
