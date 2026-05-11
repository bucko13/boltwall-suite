import { describe, expect, test } from "bun:test";

import { macaroonCodecFixtures } from "@boltwall/test-fixtures";

import {
  addFirstPartyCaveat,
  decodeRaw,
  encodeRaw,
  mintRaw,
  verifyRawSignature,
  type RawMacaroon,
} from "../src/internal/macaroon";

describe("MacaroonCodec / raw mint, encode, decode, verify", () => {
  for (const fixture of macaroonCodecFixtures) {
    test(`${fixture.name} round-trips V2 binary base64`, () => {
      const rootKey = hexToBytes(fixture.rootKeyHex);
      const raw = mintRaw({
        rootKey,
        identifier: hexToBytes(fixture.identifierHex),
        caveats: fixture.caveatHexes.map(hexToBytes),
      });

      const encoded = encodeRaw(raw);
      const decoded = decodeRaw(encoded);

      expect(rawToHex(decoded)).toEqual(rawToHex(raw));
      expect(verifyRawSignature({ macaroon: decoded, rootKey })).toBe(true);
    });
  }

  test("addFirstPartyCaveat returns a new attenuated macaroon", () => {
    const fixture = macaroonCodecFixtures[0];
    if (fixture === undefined) {
      throw new Error("missing-macaroon-fixture");
    }
    const rootKey = hexToBytes(fixture.rootKeyHex);
    const original = mintRaw({
      rootKey,
      identifier: hexToBytes(fixture.identifierHex),
    });
    const caveat = utf8ToBytes("services=pokedex:0");

    const attenuated = addFirstPartyCaveat(original, caveat);

    expect(original.caveats).toHaveLength(0);
    expect(attenuated.caveats.map(bytesToUtf8)).toEqual(["services=pokedex:0"]);
    expect(bytesToHex(attenuated.signature)).not.toBe(bytesToHex(original.signature));
    expect(verifyRawSignature({ macaroon: attenuated, rootKey })).toBe(true);
  });

  test("tampering vectors reject modified identifier, caveat, signature, and root key", () => {
    const fixture = macaroonCodecFixtures[1];
    if (fixture === undefined) {
      throw new Error("missing-macaroon-fixture");
    }
    const rootKey = hexToBytes(fixture.rootKeyHex);
    const raw = mintRaw({
      rootKey,
      identifier: hexToBytes(fixture.identifierHex),
      caveats: fixture.caveatHexes.map(hexToBytes),
    });

    expect(
      verifyRawSignature({ macaroon: flipByte(raw, "identifier"), rootKey }),
    ).toBe(false);
    expect(
      verifyRawSignature({ macaroon: flipByte(raw, "caveat"), rootKey }),
    ).toBe(false);
    expect(
      verifyRawSignature({ macaroon: flipByte(raw, "signature"), rootKey }),
    ).toBe(false);
    expect(
      verifyRawSignature({ macaroon: raw, rootKey: flipFirstByte(rootKey) }),
    ).toBe(false);
  });

  test("input validation rejects malformed raw boundaries", () => {
    const fixture = macaroonCodecFixtures[0];
    if (fixture === undefined) {
      throw new Error("missing-macaroon-fixture");
    }

    expect(() =>
      mintRaw({
        rootKey: new Uint8Array(31),
        identifier: hexToBytes(fixture.identifierHex),
      }),
    ).toThrow("rootKey must be 32 bytes");
    expect(() =>
      mintRaw({
        rootKey: hexToBytes(fixture.rootKeyHex),
        identifier: new Uint8Array(65),
      }),
    ).toThrow("identifier must be 66 bytes");
    expect(() => decodeRaw("not base64!?")).toThrow("invalid-macaroon-base64");
  });
});

function rawToHex(raw: RawMacaroon): {
  identifier: string;
  caveats: string[];
  signature: string;
} {
  return {
    identifier: bytesToHex(raw.identifier),
    caveats: raw.caveats.map(bytesToHex),
    signature: bytesToHex(raw.signature),
  };
}

function flipByte(raw: RawMacaroon, part: "identifier" | "caveat" | "signature"): RawMacaroon {
  if (part === "identifier") {
    return { ...raw, identifier: flipFirstByte(raw.identifier) };
  }
  if (part === "signature") {
    return { ...raw, signature: flipFirstByte(raw.signature) };
  }
  const caveats = raw.caveats.map((caveat, index) =>
    index === 0 ? flipFirstByte(caveat) : caveat.slice(),
  );
  return { ...raw, caveats };
}

function flipFirstByte(bytes: Uint8Array): Uint8Array {
  const next = bytes.slice();
  next[0] = (next[0] ?? 0) ^ 0xff;
  return next;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
