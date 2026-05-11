import { describe, expect, test } from "bun:test";

import { parseCaveat, serializeCaveat } from "../src/caveats";
import { expirationCaveat, expirationSatisfier } from "../src/legacy";

describe("legacy expiration caveat", () => {
  test("builds and round-trips the legacy expiration wire shape", () => {
    const caveat = expirationCaveat(1_577_228_778_197);

    expect(caveat).toEqual({
      condition: "expiration",
      value: "1577228778197",
    });
    expect(parseCaveat(serializeCaveat(caveat))).toEqual(caveat);
  });

  test("rejects non-finite expiration values", () => {
    expect(() => expirationCaveat(Number.NaN)).toThrow("invalid-expiration");
    expect(() => expirationCaveat(Number.POSITIVE_INFINITY)).toThrow("invalid-expiration");
  });
});

describe("legacy expiration satisfier", () => {
  test("accepts future expirations and rejects expired caveats", () => {
    const satisfier = expirationSatisfier();
    const context = { now: new Date(1_700_000_000_000) };

    expect(
      satisfier.satisfyFinal({ condition: "expiration", value: "1700000000001" }, context),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal({ condition: "expiration", value: "1700000000000" }, context),
    ).toBe(false);
  });

  test("enforces attenuation by allowing only earlier or equal expirations", () => {
    const satisfier = expirationSatisfier();

    expect(
      satisfier.satisfyPrevious?.(
        { condition: "expiration", value: "1700000000000" },
        { condition: "expiration", value: "1699999999999" },
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyPrevious?.(
        { condition: "expiration", value: "1700000000000" },
        { condition: "expiration", value: "1700000000001" },
      ),
    ).toBe(false);
  });

  test("rejects malformed expiration caveat values", () => {
    const satisfier = expirationSatisfier();

    expect(() => satisfier.satisfyFinal({ condition: "expiration", value: "later" }, {})).toThrow(
      "invalid-expiration",
    );
    expect(() =>
      satisfier.satisfyFinal({ condition: "expiration", value: "9007199254740992" }, {}),
    ).toThrow("invalid-expiration");
  });
});
