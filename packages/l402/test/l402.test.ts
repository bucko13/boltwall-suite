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
} from "@boltwall/test-fixtures";

import { L402 } from "../src";

describe("L402 class facade / token round trips", () => {
  test("preserves legacy LSAT emission when legacy mode is requested", () => {
    const token = `LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`;
    expect(L402.fromToken(token).toToken({ legacy: true })).toBe(token);
  });

  test("emits modern L402 by default from a modern token", () => {
    const token = `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`;
    expect(L402.fromToken(token).toToken()).toBe(token);
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

describe("L402 class facade / JSON", () => {
  test("serializes inspectable state without exposing Buffer", () => {
    const l402 = L402.fromToken(
      `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
      SPEC_EXAMPLE_INVOICE,
    );
    expect(l402.toJSON()).toEqual({
      macaroons: [SPEC_EXAMPLE_MACAROON],
      invoice: SPEC_EXAMPLE_INVOICE,
      paymentPreimage: SPEC_EXAMPLE_PREIMAGE,
      timeCreated: expect.any(Number),
      isPending: false,
      isSatisfied: false,
    });
  });
});
