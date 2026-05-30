import { describe, expect, test } from "bun:test";

import {
  Identifier,
  L402,
  mintMacaroon,
} from "../src";
import { decodeRaw } from "../src/macaroon";

describe("mintMacaroon", () => {
  test("mints a macaroon whose v0 identifier decodes to the input", () => {
    const identifier = fixtureIdentifier();

    const macaroon = mintMacaroon({
      rootKey: fixtureRootKey(),
      identifier,
    });

    const decoded = Identifier.fromMacaroon(macaroon);
    expect(bytesToHex(decoded.paymentHash)).toBe(bytesToHex(identifier.paymentHash));
    expect(bytesToHex(decoded.tokenId)).toBe(bytesToHex(identifier.tokenId));
    expect(decoded.version).toBe(0);
  });

  test("mints a macaroon with no caveats", () => {
    const macaroon = mintMacaroon({
      rootKey: fixtureRootKey(),
      identifier: fixtureIdentifier(),
    });

    const raw = decodeRaw(macaroon);
    expect(raw.caveats).toEqual([]);
    expect(raw.signature).toHaveLength(32);
  });

  test("mints a macaroon with serialized UTF-8 caveats", () => {
    const macaroon = mintMacaroon({
      rootKey: fixtureRootKey(),
      identifier: fixtureIdentifier(),
      caveats: [
        "services=pokedex:0,proxy:0",
        "pokedex_capabilities=read",
        "pokedex_valid_until=2030-01-01T00:00:00Z",
      ],
    });

    const raw = decodeRaw(macaroon);
    expect(raw.caveats.map(bytesToUtf8)).toEqual([
      "services=pokedex:0,proxy:0",
      "pokedex_capabilities=read",
      "pokedex_valid_until=2030-01-01T00:00:00Z",
    ]);
  });

  test("mints and decodes a macaroon with multiple first-party caveats", () => {
    const macaroon = mintMacaroon({
      rootKey: fixtureRootKey(),
      identifier: fixtureIdentifier(),
      caveats: [
        "services=pokedex:0,proxy:0",
        "services=pokedex:0",
        "pokedex_capabilities=read",
        "unknown-aperture-vector=ignored",
      ],
    });

    const raw = decodeRaw(macaroon);
    expect(raw.caveats.map(bytesToUtf8)).toEqual([
      "services=pokedex:0,proxy:0",
      "services=pokedex:0",
      "pokedex_capabilities=read",
      "unknown-aperture-vector=ignored",
    ]);
  });

  test("round-trips through Authorization header helpers", () => {
    const macaroon = mintMacaroon({
      rootKey: fixtureRootKey(),
      identifier: fixtureIdentifier(),
      caveats: ["services=pokedex:0"],
    });
    const preimage = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

    const token = new L402({ macaroons: macaroon, paymentPreimage: preimage });
    const parsed = L402.fromToken(token.toAuthorizationHeader());

    expect(parsed.macaroons).toEqual([macaroon]);
    expect(parsed.paymentPreimage).toBe(preimage);
  });

  test("validates root key and v0 identifier byte boundaries", () => {
    const identifier = fixtureIdentifier();

    expect(() =>
      mintMacaroon({
        rootKey: new Uint8Array(31),
        identifier,
      }),
    ).toThrow("rootKey must be 32 bytes");
    expect(() =>
      mintMacaroon({
        rootKey: fixtureRootKey(),
        identifier: { ...identifier, paymentHash: new Uint8Array(31) },
      }),
    ).toThrow("paymentHash must be 32 bytes");
    expect(() =>
      mintMacaroon({
        rootKey: fixtureRootKey(),
        identifier: { ...identifier, tokenId: new Uint8Array(31) },
      }),
    ).toThrow("tokenId must be 32 bytes");
  });
});

function fixtureRootKey(): Uint8Array {
  return hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
}

function fixtureIdentifier(): {
  version: 0;
  paymentHash: Uint8Array;
  tokenId: Uint8Array;
} {
  return {
    version: 0,
    paymentHash: hexToBytes("1111111111111111111111111111111111111111111111111111111111111111"),
    tokenId: hexToBytes("2222222222222222222222222222222222222222222222222222222222222222"),
  };
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

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
