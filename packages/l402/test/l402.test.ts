import { describe, expect, test } from "bun:test";

import {
  IDENTIFIER_PAYMENT_HASH_HEX,
  specIdentifierFixtures,
} from "../../test-fixtures/src/identifiers";
import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
  specPreimageFixtures,
} from "@boltwall/test-fixtures";

import {
  InMemoryRootKeyStore,
  L402,
  mintMacaroon,
  servicesSatisfier,
  validUntil,
} from "../src";

const goodPreimageFixture = specPreimageFixtures.find(
  (fixture) => fixture.name === "zero-preimage-canonical",
);

if (goodPreimageFixture === undefined) {
  throw new Error("missing-l402-good-preimage-fixture");
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function mintVerifiableL402(): Promise<{
  l402: L402;
  rootKeyStore: InMemoryRootKeyStore;
}> {
  const rootKey = new Uint8Array(32).fill(0x11);
  const tokenId = new Uint8Array(32).fill(0x22);
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(tokenId, rootKey);
  const macaroon = mintMacaroon({
    rootKey,
    identifier: {
      version: 0,
      paymentHash: hexToBytes(goodPreimageFixture.paymentHashHex),
      tokenId,
    },
    caveats: ["services=pokedex:0"],
  });

  return {
    l402: new L402({
      macaroons: macaroon,
      paymentPreimage: goodPreimageFixture.preimageHex,
    }),
    rootKeyStore,
  };
}

describe("L402 class facade / token round trips", () => {
  test("preserves legacy LSAT emission when legacy mode is requested", () => {
    const token = `LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`;
    expect(L402.fromToken(token).toToken({ legacy: true })).toBe(token);
  });

  test("emits modern L402 by default from a modern token", () => {
    const token = `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`;
    expect(L402.fromToken(token).toToken()).toBe(token);
  });

  test("toAuthorizationHeader emits modern and legacy credentials", () => {
    const l402 = L402.fromToken(`LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`);
    expect(l402.toAuthorizationHeader()).toBe(
      `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
    expect(l402.toAuthorizationHeader({ legacy: true })).toBe(
      `LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
  });

  test("round-trips multi-macaroon credentials", () => {
    const token = `LSAT ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`;
    expect(L402.fromToken(token).toToken()).toBe(
      `L402 ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
  });

  test("keeps pending token state separate from paid Authorization tokens", () => {
    const token = `LSAT ${SPEC_EXAMPLE_MACAROON}:`;
    const l402 = L402.fromToken(token);
    expect(l402.isPending()).toBe(true);
    expect(() => l402.toToken({ legacy: true })).toThrow("missing-preimage");
    expect(l402.toPendingToken({ legacy: true })).toBe(token);
    expect(l402.toPendingToken()).toBe(`L402 ${SPEC_EXAMPLE_MACAROON}:`);
  });

  test("rejects malformed pending tokens through the compatibility parser", () => {
    expect(() => L402.fromToken(`Bearer ${SPEC_EXAMPLE_MACAROON}:`)).toThrow("scheme-mismatch");
    expect(() => L402.fromToken("L402 :")).toThrow("empty-macaroons");
  });
});

describe("L402 class facade / challenges", () => {
  test("parses a full WWW-Authenticate challenge", () => {
    const l402 = L402.fromHeader(
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    );
    expect(l402.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
    expect(l402.invoice).toBe(SPEC_EXAMPLE_INVOICE);
  });

  test("parses a raw legacy challenge without a scheme prefix", () => {
    const l402 = L402.fromChallenge(
      `macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    );
    expect(l402.toChallenge()).toBe(
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    );
    expect(l402.toChallenge({ legacy: true })).toBe(
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    );
  });

  test("emits dual authenticate headers by default for server object workflows", () => {
    const l402 = new L402({
      macaroons: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
    });
    expect(l402.toAuthenticateHeaders()).toEqual([
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);
    expect(l402.toChallenge()).toBe(
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    );
  });

  test("collapses identical dual LSAT and L402 challenges into one object", () => {
    const dual = [
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ];
    const fromArray = L402.fromHeader(dual);
    const fromFolded = L402.fromHeader(dual.join(", "));

    expect(fromArray.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
    expect(fromArray.invoice).toBe(SPEC_EXAMPLE_INVOICE);
    expect(fromFolded.toChallenge()).toBe(fromArray.toChallenge());
  });

  test("rejects conflicting repeated challenges", () => {
    expect(() =>
      L402.fromHeader([
        `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
        `L402 macaroon="${SPEC_EXAMPLE_MACAROON_2}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      ]),
    ).toThrow("ambiguous-challenge");
  });
});

describe("L402 class facade / preimage state", () => {
  test("decodes macaroon identifier payment hash in fromMacaroon", () => {
    const fixture = specIdentifierFixtures[0];
    if (!fixture?.expected.ok) {
      throw new Error("missing identifier fixture");
    }
    const l402 = L402.fromMacaroon(fixture.macaroon, SPEC_EXAMPLE_INVOICE);
    expect(l402.paymentHashHex).toBe(IDENTIFIER_PAYMENT_HASH_HEX);
    expect(l402.invoice).toBe(SPEC_EXAMPLE_INVOICE);
  });

  test("setPreimage validates against known payment hash", () => {
    const l402 = new L402({
      macaroons: SPEC_EXAMPLE_MACAROON,
      paymentHash: "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    });
    l402.setPreimage("0000000000000000000000000000000000000000000000000000000000000000");
    expect(l402.isPending()).toBe(false);
    expect(l402.isSatisfied()).toBe(true);
  });

  test("setPreimage rejects malformed and mismatched preimages", () => {
    const l402 = new L402({
      macaroons: SPEC_EXAMPLE_MACAROON,
      paymentHash: "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925",
    });
    expect(() => l402.setPreimage("abc")).toThrow("preimage must be 32 bytes");
    expect(() =>
      l402.setPreimage("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"),
    ).toThrow("preimage-mismatch");
  });
});

describe("L402 class facade / macaroon object helpers", () => {
  test("attaches invoices and inspects caveats", async () => {
    const { l402 } = await mintVerifiableL402();
    expect(l402.addInvoice(SPEC_EXAMPLE_INVOICE)).toBe(l402);
    expect(l402.invoice).toBe(SPEC_EXAMPLE_INVOICE);
    expect(l402.inspectMacaroon().identifierBytes).toHaveLength(66);
    expect(l402.getCaveats()).toEqual([{ condition: "services", value: "pokedex:0" }]);
  });

  test("adds first-party caveats and detects expiration caveats", async () => {
    const { l402 } = await mintVerifiableL402();

    l402.addFirstPartyCaveat(validUntil({ iso: "2026-01-01T00:00:00.000Z" }));
    l402.addFirstPartyCaveat("expiration=1767225600000");

    expect(l402.getCaveats()).toEqual([
      { condition: "services", value: "pokedex:0" },
      { condition: "valid-until", value: "2026-01-01T00:00:00.000Z" },
      { condition: "expiration", value: "1767225600000" },
    ]);
    expect(l402.isExpired(new Date("2025-12-31T23:59:59.000Z"))).toBe(false);
    expect(l402.isExpired(new Date("2026-01-01T00:00:00.000Z"))).toBe(true);
  });

  test("delegates verification with the attached preimage", async () => {
    const { l402, rootKeyStore } = await mintVerifiableL402();

    await expect(
      l402.verify({
        rootKeyStore,
        satisfiers: [servicesSatisfier("pokedex")],
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("L402 class facade / JSON", () => {
  test("serializes inspectable state without exposing Buffer or payment preimage", () => {
    const l402 = L402.fromToken(
      `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
      SPEC_EXAMPLE_INVOICE,
    );
    expect(l402.toJSON()).toEqual({
      macaroons: [SPEC_EXAMPLE_MACAROON],
      invoice: SPEC_EXAMPLE_INVOICE,
      timeCreated: expect.any(Number),
      isPending: false,
      isSatisfied: false,
    });
    expect(l402.toJSON()).not.toHaveProperty("paymentPreimage");
  });
});
