import { describe, expect, test } from "bun:test";

import { btc, msats, sats } from "../src/pricing";

describe("pricing helpers", () => {
  test("converts whole sats to bigint millisatoshis", () => {
    expect(sats(0)).toBe(0n);
    expect(sats(1)).toBe(1_000n);
    expect(sats(21_000_000n * 100_000_000n)).toBe(
      2_100_000_000_000_000_000n,
    );
  });

  test("passes canonical msats through", () => {
    expect(msats(0n)).toBe(0n);
    expect(msats(1_500n)).toBe(1_500n);
  });

  test("converts btc to bigint millisatoshis", () => {
    expect(btc(0)).toBe(0n);
    expect(btc(1)).toBe(100_000_000_000n);
    expect(btc(0.5)).toBe(50_000_000_000n);
    expect(btc(0.00000000001)).toBe(1n);
    expect(btc(21_000_000n)).toBe(2_100_000_000_000_000_000n);
  });

  test("rejects fractional satoshi inputs", () => {
    expect(() => sats(1.5)).toThrow("whole number");
  });

  test("rejects btc inputs below msat resolution", () => {
    expect(() => btc(0.000000000001)).toThrow("safe whole millisatoshi");
  });

  test("rejects negative inputs", () => {
    expect(() => sats(-1)).toThrow("non-negative");
    expect(() => sats(-1n)).toThrow("non-negative");
    expect(() => msats(-1n)).toThrow("non-negative");
    expect(() => btc(-1)).toThrow("non-negative");
    expect(() => btc(-1n)).toThrow("non-negative");
  });

  test("rejects non-finite number inputs", () => {
    expect(() => sats(Number.NaN)).toThrow("whole number");
    expect(() => sats(Number.POSITIVE_INFINITY)).toThrow("whole number");
    expect(() => btc(Number.NEGATIVE_INFINITY)).toThrow("finite");
  });
});
