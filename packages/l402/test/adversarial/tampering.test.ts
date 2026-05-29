import { describe, expect, test } from "bun:test";

import {
  ZERO_PREIMAGE_HEX,
  macaroonCodecFixtures,
  NONTRIVIAL_PREIMAGE_HEX,
  ZERO_PREIMAGE_PAYMENT_HASH_HEX,
} from "@boltwall/test-fixtures";

import { InMemoryRootKeyStore, mintMacaroon, servicesSatisfier, verifyMacaroon } from "../../src";
import { decodeRaw, encodeRaw, type RawMacaroon } from "../../src/macaroon";

// L402 macaroon-spec.md §HMAC Chain Construction and §Verification require
// identifier, caveat, and signature bytes to be tamper-proof through the
// recomputed HMAC chain and constant-time signature comparison.

const BASE_FIXTURE = macaroonCodecFixtures.find(
  (fixture) => fixture.name === "v0-identifier-standard-caveats",
);

if (BASE_FIXTURE === undefined) {
  throw new Error("missing v0-identifier-standard-caveats fixture");
}

describe("adversarial macaroon tampering", () => {
  test.each([
    [0, "version byte 0"],
    [5, "payment hash byte 5"],
    [50, "token id byte 50"],
  ] as const)("rejects modified identifier at %s (%s)", async (index) => {
    const fixture = await createFixture();
    const tampered = tamperRaw(fixture.macaroon, (raw) => ({
      ...raw,
      identifier: flipByte(raw.identifier, index),
    }));
    if (index >= 34) {
      await fixture.rootKeyStore.put(decodeRaw(tampered).identifier.slice(34, 66), fixture.rootKey);
    }

    await expect(verifyFixture(fixture, tampered)).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects a modified caveat byte with one caveat", async () => {
    const fixture = await createFixture({
      caveatHexes: [BASE_FIXTURE.caveatHexes[0] ?? ""],
    });
    const tampered = tamperRaw(fixture.macaroon, (raw) => ({
      ...raw,
      caveats: replaceCaveat(raw.caveats, 0, 0),
    }));

    await expect(verifyFixture(fixture, tampered)).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects a modified second caveat byte with three caveats", async () => {
    const fixture = await createFixture({
      caveatHexes: [
        BASE_FIXTURE.caveatHexes[0] ?? "",
        BASE_FIXTURE.caveatHexes[1] ?? "",
        utf8ToHex("pokedex_valid_until=2030-01-01T00:00:00Z"),
      ],
    });
    const tampered = tamperRaw(fixture.macaroon, (raw) => ({
      ...raw,
      caveats: replaceCaveat(raw.caveats, 1, 3),
    }));

    await expect(verifyFixture(fixture, tampered)).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects a modified last signature byte", async () => {
    const fixture = await createFixture();
    const tampered = tamperRaw(fixture.macaroon, (raw) => ({
      ...raw,
      signature: flipByte(raw.signature, raw.signature.length - 1),
    }));

    await expect(verifyFixture(fixture, tampered)).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects a replaced signature", async () => {
    const fixture = await createFixture();
    const tampered = tamperRaw(fixture.macaroon, (raw) => ({
      ...raw,
      signature: hexToBytes("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
    }));

    await expect(verifyFixture(fixture, tampered)).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects a mismatched payment preimage", async () => {
    const fixture = await createFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: NONTRIVIAL_PREIMAGE_HEX,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "preimage-mismatch" });
  });

  test("rejects a known token id backed by the wrong root key", async () => {
    const fixture = await createFixture();
    const wrongRootKeyStore = new InMemoryRootKeyStore();
    await wrongRootKeyStore.put(
      hexToBytes(BASE_FIXTURE.identifierHex).slice(34, 66),
      hexToBytes("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    );

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimageHex,
        rootKeyStore: wrongRootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "signature-invalid" });
  });

  test("rejects an empty macaroon credential list", async () => {
    const fixture = await createFixture();

    await expect(
      verifyMacaroon({
        macaroons: [],
        preimage: fixture.preimageHex,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).rejects.toThrow("empty macaroon credential");
  });

  test("rejects an empty preimage", async () => {
    const fixture = await createFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: "",
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "preimage-mismatch" });
  });
});

async function createFixture(args: { caveatHexes?: string[] } = {}): Promise<{
  macaroon: string;
  preimageHex: string;
  rootKeyStore: InMemoryRootKeyStore;
  rootKey: Uint8Array;
}> {
  const rootKey = hexToBytes(BASE_FIXTURE.rootKeyHex);
  const identifier = hexToBytes(BASE_FIXTURE.identifierHex);
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(identifier.slice(34, 66), rootKey);

  return {
    macaroon: mintMacaroon({
      rootKey,
      identifier: {
        version: 0,
        paymentHash: hexToBytes(ZERO_PREIMAGE_PAYMENT_HASH_HEX),
        tokenId: identifier.slice(34, 66),
      },
      caveats: (args.caveatHexes ?? BASE_FIXTURE.caveatHexes).map((caveatHex) =>
        parseCaveatBytes(hexToBytes(caveatHex)),
      ),
    }),
    preimageHex: ZERO_PREIMAGE_HEX,
    rootKeyStore,
    rootKey,
  };
}

async function verifyFixture(
  fixture: { preimageHex: string; rootKeyStore: InMemoryRootKeyStore },
  macaroon: string,
) {
  return verifyMacaroon({
    macaroons: [macaroon],
    preimage: fixture.preimageHex,
    rootKeyStore: fixture.rootKeyStore,
    satisfiers: [servicesSatisfier("pokedex")],
    context: {},
  });
}

function tamperRaw(macaroon: string, update: (raw: RawMacaroon) => RawMacaroon): string {
  return encodeRaw(update(decodeRaw(macaroon)));
}

function replaceCaveat(
  caveats: Uint8Array[],
  caveatIndex: number,
  byteIndex: number,
): Uint8Array[] {
  return caveats.map((caveat, index) =>
    index === caveatIndex ? flipByte(caveat, byteIndex) : caveat.slice(),
  );
}

function flipByte(bytes: Uint8Array, index: number): Uint8Array {
  const next = bytes.slice();
  next[index] = (next[index] ?? 0) ^ 0xff;
  return next;
}

function parseCaveatBytes(bytes: Uint8Array): string {
  const encoded = new TextDecoder().decode(bytes);
  const separatorIndex = encoded.indexOf("=");
  if (separatorIndex < 1) {
    throw new Error(`invalid caveat fixture: ${encoded}`);
  }
  return encoded;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function utf8ToHex(input: string): string {
  return Array.from(new TextEncoder().encode(input), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
