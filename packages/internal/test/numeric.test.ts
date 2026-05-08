import { describe, expect, test } from "bun:test";

import {
  formatBtc,
  formatSats,
  msatsToSats,
  parseAmount,
  satsToMsats,
} from "../src/numeric";

describe("satsToMsats", () => {
  test("converts whole sats to msats", () => {
    expect(satsToMsats(0n)).toBe(0n);
    expect(satsToMsats(1n)).toBe(1_000n);
    expect(satsToMsats(21_000_000n * 100_000_000n)).toBe(
      2_100_000_000_000_000_000n,
    );
  });

  test("rejects negative values", () => {
    expect(() => satsToMsats(-1n)).toThrow("non-negative");
  });
});

describe("msatsToSats", () => {
  test("splits whole sats and remainder", () => {
    expect(msatsToSats(0n)).toEqual({ sats: 0n, msatRemainder: 0n });
    expect(msatsToSats(1n)).toEqual({ sats: 0n, msatRemainder: 1n });
    expect(msatsToSats(1_234n)).toEqual({ sats: 1n, msatRemainder: 234n });
  });

  test("rejects negative values", () => {
    expect(() => msatsToSats(-1n)).toThrow("non-negative");
  });
});

describe("parseAmount", () => {
  test("parses sats, msats, and btc into msats", () => {
    expect(parseAmount("100")).toBe(100_000n);
    expect(parseAmount("0.5 sats")).toBe(500n);
    expect(parseAmount("1500 msats")).toBe(1_500n);
    expect(parseAmount("0.00000000001 btc")).toBe(1n);
    expect(parseAmount("0.00000001 btc")).toBe(1_000n);
  });

  test("respects explicit default units", () => {
    expect(parseAmount("100", "msats")).toBe(100n);
    expect(parseAmount("1", "btc")).toBe(100_000_000_000n);
  });

  test("accepts redundant trailing zeros above msat precision", () => {
    expect(parseAmount("1.0000 sats")).toBe(1_000n);
    expect(parseAmount("2.500000000000 btc")).toBe(250_000_000_000n);
  });

  test("rejects invalid formats and sub-msat precision", () => {
    expect(() => parseAmount("")).toThrow("empty");
    expect(() => parseAmount("-1 sats")).toThrow("plain non-negative");
    expect(() => parseAmount("1e3 sats")).toThrow("plain non-negative");
    expect(() => parseAmount("1,000 sats")).toThrow("plain non-negative");
    expect(() => parseAmount("0.0001 msats")).toThrow("below 1 msat");
    expect(() => parseAmount("0.0001 sats")).toThrow("below 1 msat");
    expect(() => parseAmount("0.000000000001 btc")).toThrow("below 1 msat");
    expect(() => parseAmount("5 dogs")).toThrow("Unsupported amount unit");
  });
});

describe("formatSats", () => {
  test("formats msats as sats strings", () => {
    expect(formatSats(0n)).toBe("0");
    expect(formatSats(1n)).toBe("0.001");
    expect(formatSats(1_230n)).toBe("1.23");
    expect(formatSats(2_000n)).toBe("2");
  });

  test("rejects negative values", () => {
    expect(() => formatSats(-1n)).toThrow("non-negative");
  });
});

describe("formatBtc", () => {
  test("formats msats as btc strings", () => {
    expect(formatBtc(0n)).toBe("0");
    expect(formatBtc(1n)).toBe("0.00000000001");
    expect(formatBtc(1_000n)).toBe("0.00000001");
    expect(formatBtc(123_456_789_000n)).toBe("1.23456789");
  });

  test("rejects negative values", () => {
    expect(() => formatBtc(-1n)).toThrow("non-negative");
  });
});
