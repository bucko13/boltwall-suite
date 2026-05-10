import { describe, expect, test } from "bun:test";

import { btc, msats, sats } from "../src/express/index";

describe("express pricing re-export", () => {
  test("re-exports public l402 pricing helpers", () => {
    expect(sats(2)).toBe(2_000n);
    expect(msats(3n)).toBe(3n);
    expect(btc(1n)).toBe(100_000_000_000n);
  });
});
