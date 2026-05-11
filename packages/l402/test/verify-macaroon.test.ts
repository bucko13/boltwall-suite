import { sha256 } from "@noble/hashes/sha2.js";
import { describe, expect, test } from "bun:test";

import {
  InMemoryRootKeyStore,
  capabilitiesSatisfier,
  mintMacaroon,
  routeSatisfier,
  servicesSatisfier,
  validUntilSatisfier,
  verifyMacaroon,
  type CaveatSatisfier,
} from "../src";
import { decodeRaw, encodeRaw, type RawMacaroon } from "../src/internal/macaroon";

describe("verifyMacaroon", () => {
  test("accepts a single macaroon with matching signature, preimage, and caveat", async () => {
    const fixture = await createFixture({
      caveats: [{ condition: "services", value: "pokedex:0" }],
    });

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("accepts multiple macaroons bound to the same preimage", async () => {
    const first = await createFixture({
      tokenId: repeatedBytes(0x22),
      caveats: [{ condition: "services", value: "pokedex:0" }],
    });
    const second = await createFixture({
      tokenId: repeatedBytes(0x33),
      paymentHash: first.paymentHash,
      caveats: [{ condition: "services", value: "pokedex:0" }],
      rootKeyStore: first.rootKeyStore,
    });

    await expect(
      verifyMacaroon({
        macaroons: [first.macaroon, second.macaroon],
        preimage: first.preimage,
        rootKeyStore: first.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });

  test("rejects tampered signature, identifier, and caveat bytes", async () => {
    const fixture = await createFixture({
      caveats: [{ condition: "services", value: "pokedex:0" }],
    });

    await expect(verifyFixture(fixture, tamper(fixture.macaroon, "signature"))).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
    await expect(verifyFixture(fixture, tamper(fixture.macaroon, "identifier"))).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
    await expect(verifyFixture(fixture, tamper(fixture.macaroon, "caveat"))).resolves.toEqual({
      ok: false,
      reason: "signature-invalid",
    });
  });

  test("rejects mismatched preimages", async () => {
    const fixture = await createFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: repeatedBytes(0xff),
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "preimage-mismatch" });
  });

  test("rejects unknown token ids", async () => {
    const fixture = await createFixture();

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: new InMemoryRootKeyStore(),
        satisfiers: [],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "unknown-token" });
  });

  test("rejects known caveats when final or previous checks fail", async () => {
    const finalReject = await createFixture({
      caveats: [{ condition: "services", value: "proxy:0" }],
    });
    const attenuationReject = await createFixture({
      caveats: [
        { condition: "services", value: "pokedex:0" },
        { condition: "services", value: "pokedex:0,proxy:0" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [finalReject.macaroon],
        preimage: finalReject.preimage,
        rootKeyStore: finalReject.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:services" });
    await expect(
      verifyMacaroon({
        macaroons: [attenuationReject.macaroon],
        preimage: attenuationReject.preimage,
        rootKeyStore: attenuationReject.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:services" });
  });

  test("rejects malformed services values without throwing", async () => {
    const finalReject = await createFixture({
      caveats: [{ condition: "services", value: "pokedex" }],
    });
    const attenuationReject = await createFixture({
      caveats: [
        { condition: "services", value: "pokedex:0" },
        { condition: "services", value: "" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [finalReject.macaroon],
        preimage: finalReject.preimage,
        rootKeyStore: finalReject.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:services" });
    await expect(
      verifyMacaroon({
        macaroons: [attenuationReject.macaroon],
        preimage: attenuationReject.preimage,
        rootKeyStore: attenuationReject.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:services" });
  });

  test("rejects malformed valid-until values without throwing", async () => {
    const finalReject = await createFixture({
      caveats: [{ condition: "valid-until", value: "later" }],
    });
    const attenuationReject = await createFixture({
      caveats: [
        { condition: "valid-until", value: "2030-01-01T00:00:00Z" },
        { condition: "valid-until", value: "eventually" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [finalReject.macaroon],
        preimage: finalReject.preimage,
        rootKeyStore: finalReject.rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date("2026-01-01T00:00:00Z") },
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:valid-until" });
    await expect(
      verifyMacaroon({
        macaroons: [attenuationReject.macaroon],
        preimage: attenuationReject.preimage,
        rootKeyStore: attenuationReject.rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: { now: new Date("2026-01-01T00:00:00Z") },
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:valid-until" });
  });

  test("rejects malformed route and capability values without throwing", async () => {
    const routeReject = await createFixture({
      caveats: [{ condition: "route", value: "" }],
    });
    const capabilityReject = await createFixture({
      caveats: [{ condition: "pokedex_capabilities", value: "" }],
    });

    await expect(
      verifyMacaroon({
        macaroons: [routeReject.macaroon],
        preimage: routeReject.preimage,
        rootKeyStore: routeReject.rootKeyStore,
        satisfiers: [routeSatisfier(["/pokemon/*"])],
        context: { request: new Request("https://example.test/pokemon/1") },
      }),
    ).resolves.toEqual({ ok: false, reason: "caveat-rejected:route" });
    await expect(
      verifyMacaroon({
        macaroons: [capabilityReject.macaroon],
        preimage: capabilityReject.preimage,
        rootKeyStore: capabilityReject.rootKeyStore,
        satisfiers: [capabilitiesSatisfier("pokedex", "read")],
        context: {},
      }),
    ).resolves.toEqual({
      ok: false,
      reason: "caveat-rejected:pokedex_capabilities",
    });
  });

  test("skips unknown caveats by default and rejects them in strict mode", async () => {
    const fixture = await createFixture({
      caveats: [
        { condition: "services", value: "pokedex:0" },
        { condition: "future-mode", value: "enabled" },
      ],
    });

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
        strictUnknownCaveats: true,
      }),
    ).resolves.toEqual({ ok: false, reason: "unknown-caveat:future-mode" });
  });

  test("supports RegExp satisfier conditions", async () => {
    const fixture = await createFixture({
      caveats: [{ condition: "pokedex_capabilities", value: "read" }],
    });
    const satisfier: CaveatSatisfier = {
      condition: /_capabilities$/,
      satisfyFinal(caveat) {
        return caveat.value === "read";
      },
    };

    await expect(
      verifyMacaroon({
        macaroons: [fixture.macaroon],
        preimage: fixture.preimage,
        rootKeyStore: fixture.rootKeyStore,
        satisfiers: [satisfier],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });
});

async function createFixture(
  args: {
    rootKey?: Uint8Array;
    tokenId?: Uint8Array;
    preimage?: Uint8Array;
    paymentHash?: Uint8Array;
    caveats?: Array<{ condition: string; value: string }>;
    rootKeyStore?: InMemoryRootKeyStore;
  } = {},
): Promise<{
  macaroon: string;
  preimage: Uint8Array;
  paymentHash: Uint8Array;
  rootKeyStore: InMemoryRootKeyStore;
}> {
  const rootKey = args.rootKey ?? fixtureRootKey();
  const tokenId = args.tokenId ?? repeatedBytes(0x22);
  const preimage = args.preimage ?? repeatedBytes(0x00);
  const paymentHash = args.paymentHash ?? sha256(preimage);
  const rootKeyStore = args.rootKeyStore ?? new InMemoryRootKeyStore();
  await rootKeyStore.put(tokenId, rootKey);

  return {
    macaroon: mintMacaroon({
      rootKey,
      identifier: {
        version: 0,
        paymentHash,
        tokenId,
      },
      caveats: args.caveats,
    }),
    preimage,
    paymentHash,
    rootKeyStore,
  };
}

async function verifyFixture(
  fixture: {
    preimage: Uint8Array;
    rootKeyStore: InMemoryRootKeyStore;
  },
  macaroon: string,
): Promise<ReturnType<typeof verifyMacaroon> extends Promise<infer T> ? T : never> {
  return verifyMacaroon({
    macaroons: [macaroon],
    preimage: fixture.preimage,
    rootKeyStore: fixture.rootKeyStore,
    satisfiers: [servicesSatisfier("pokedex")],
    context: {},
  });
}

function tamper(macaroon: string, part: "identifier" | "caveat" | "signature"): string {
  const raw = decodeRaw(macaroon);
  if (part === "identifier") {
    return encodeRaw({ ...raw, identifier: flipByte(raw.identifier, 2) });
  }
  if (part === "signature") {
    return encodeRaw({ ...raw, signature: flipByte(raw.signature, 0) });
  }
  return encodeRaw({
    ...raw,
    caveats: raw.caveats.map((caveat, index) =>
      index === 0 ? flipByte(caveat, 0) : caveat.slice(),
    ),
  });
}

function fixtureRootKey(): Uint8Array {
  return hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
}

function repeatedBytes(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function flipByte(bytes: Uint8Array, index: number): Uint8Array {
  const next = bytes.slice();
  next[index] = (next[index] ?? 0) ^ 0xff;
  return next;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
