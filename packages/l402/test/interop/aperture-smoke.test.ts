import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";

import {
  InMemoryRootKeyStore,
  buildAuthorizationHeader,
  capabilitiesSatisfier,
  mintMacaroon,
  parseAuthorizationHeader,
  parseCaveat,
  servicesSatisfier,
  verifyMacaroon,
  type Caveat,
  type CaveatSatisfier,
} from "../../src";
import { decodeRaw } from "../../src/internal/macaroon";

const APERTURE_PAYMENT_HASH = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const APERTURE_TOKEN_ID = Uint8Array.from({ length: 32 }, (_, index) => 32 - index);
const ROOT_KEY = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const PREIMAGE = new Uint8Array(32).fill(0x42);
const PREIMAGE_HASH = sha256(PREIMAGE);

describe("Aperture library vector smoke", () => {
  test("matches Aperture EncodeIdentifierBytes byte layout", () => {
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: {
        version: 0,
        paymentHash: APERTURE_PAYMENT_HASH,
        tokenId: APERTURE_TOKEN_ID,
      },
    });
    const raw = decodeRaw(macaroon);

    // L402 macaroon-spec.md §Identifier Structure; Aperture
    // l402/identifier_test.go uses payment_hash=[1..32] and token_id=[32..1],
    // expecting 2-byte big-endian version 0 followed by payment hash and token id.
    expect(bytesToHex(raw.identifier)).toBe(
      [
        "0000",
        "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
        "201f1e1d1c1b1a191817161514131211100f0e0d0c0b0a090807060504030201",
      ].join(""),
    );
  });

  test("parses Aperture SetHeader Authorization shapes", () => {
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: {
        version: 0,
        paymentHash: PREIMAGE_HASH,
        tokenId: APERTURE_TOKEN_ID,
      },
    });
    const l402 = buildAuthorizationHeader({
      macaroons: macaroon,
      preimage: bytesToHex(PREIMAGE),
    });
    const lsat = buildAuthorizationHeader({
      macaroons: macaroon,
      preimage: bytesToHex(PREIMAGE),
      legacy: true,
    });

    // L402 protocol-specification.md §5 and §10; Aperture l402/header.go accepts
    // both Authorization schemes and SetHeader emits LSAT first for legacy
    // compatibility before adding L402.
    expect(parseAuthorizationHeader(lsat)).toEqual({
      scheme: "LSAT",
      macaroons: [macaroon],
      preimage: bytesToHex(PREIMAGE),
    });
    expect(parseAuthorizationHeader(l402)).toEqual({
      scheme: "L402",
      macaroons: [macaroon],
      preimage: bytesToHex(PREIMAGE),
    });
  });

  test("matches Aperture caveat parser vectors", () => {
    expect(parseCaveat("expiration=1337")).toEqual({
      condition: "expiration",
      value: "1337",
    });
    expect(parseCaveat("expiration=1337=")).toEqual({
      condition: "expiration",
      value: "1337=",
    });
    expect(() => parseCaveat("expiration:1337")).toThrow("missing-caveat-separator");
  });

  test("verifies Aperture services and capabilities behavior", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(APERTURE_TOKEN_ID, ROOT_KEY);
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: {
        version: 0,
        paymentHash: PREIMAGE_HASH,
        tokenId: APERTURE_TOKEN_ID,
      },
      caveats: [
        { condition: "services", value: "restricted:0,other:0" },
        { condition: "services", value: "restricted:0" },
        { condition: "restricted_capabilities", value: "read" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE,
        rootKeyStore,
        satisfiers: [servicesSatisfier("restricted"), capabilitiesSatisfier("restricted", "read")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("verifies Aperture unknown caveat behavior", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(APERTURE_TOKEN_ID, ROOT_KEY);
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: {
        version: 0,
        paymentHash: PREIMAGE_HASH,
        tokenId: APERTURE_TOKEN_ID,
      },
      caveats: [
        { condition: "services", value: "restricted:0" },
        { condition: "unknown-aperture-vector", value: "ignored" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE,
        rootKeyStore,
        satisfiers: [servicesSatisfier("restricted")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("verifies Aperture timeout attenuation behavior", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(APERTURE_TOKEN_ID, ROOT_KEY);
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: {
        version: 0,
        paymentHash: PREIMAGE_HASH,
        tokenId: APERTURE_TOKEN_ID,
      },
      caveats: [
        { condition: "restricted_valid_until", value: "1000" },
        { condition: "restricted_valid_until", value: "500" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE,
        rootKeyStore,
        satisfiers: [apertureTimeoutSatisfier("restricted", new Date(0))],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });
});

function apertureTimeoutSatisfier(service: string, now: Date): CaveatSatisfier {
  return {
    condition: `${service}_valid_until`,
    satisfyPrevious(previous, next) {
      return parseUnixSeconds(next) <= parseUnixSeconds(previous);
    },
    satisfyFinal(caveat) {
      return Math.floor(now.getTime() / 1000) < parseUnixSeconds(caveat);
    },
  };
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    throw new Error("invalid-hex");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function parseUnixSeconds(caveat: Caveat): number {
  if (!/^\d+$/.test(caveat.value)) {
    throw new Error("invalid-aperture-timeout");
  }
  return Number(caveat.value);
}
