import { describe, expect, test } from "bun:test";

import { attenuationChainFixtures } from "@boltwall/test-fixtures";

import type { CaveatSatisfier } from "../src/satisfiers";
import {
  capabilitiesSatisfier,
  originSatisfier,
  routeSatisfier,
  servicesSatisfier,
  validUntilSatisfier,
} from "../src/satisfiers";

const satisfiersByCondition = new Map<string, CaveatSatisfier>([
  ["services", servicesSatisfier("pokedex")],
  ["pokedex_capabilities", capabilitiesSatisfier("pokedex", "read")],
  ["valid-until", validUntilSatisfier()],
  ["origin", originSatisfier("any")],
  ["route", routeSatisfier(["/pokemon/*", "/invoice/*"])],
]);

describe("built-in caveat satisfiers / final checks", () => {
  test("servicesSatisfier accepts target service and rejects missing service", () => {
    const satisfier = servicesSatisfier("pokedex");

    expect(
      satisfier.satisfyFinal(
        { condition: "services", value: "pokedex:0,proxy:0" },
        {},
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal({ condition: "services", value: "proxy:0" }, {}),
    ).toBe(false);
  });

  test("capabilitiesSatisfier accepts required capability and rejects missing capability", () => {
    const satisfier = capabilitiesSatisfier("pokedex", "read");

    expect(
      satisfier.satisfyFinal(
        { condition: "pokedex_capabilities", value: "read,write" },
        {},
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal(
        { condition: "pokedex_capabilities", value: "write" },
        {},
      ),
    ).toBe(false);
  });

  test("validUntilSatisfier checks current time and rejects expired or malformed timestamps", () => {
    const satisfier = validUntilSatisfier();
    const context = { now: new Date("2026-01-01T00:00:00.000Z") };

    expect(
      satisfier.satisfyFinal(
        { condition: "valid-until", value: "2027-01-01T00:00:00.000Z" },
        context,
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal(
        { condition: "valid-until", value: "2025-01-01T00:00:00.000Z" },
        context,
      ),
    ).toBe(false);
    expect(() =>
      satisfier.satisfyFinal({ condition: "valid-until", value: "later" }, context),
    ).toThrow("invalid-valid-until");
  });

  test("originSatisfier requires request Origin to be allowed by policy and caveat", () => {
    const satisfier = originSatisfier(["https://app.example"]);
    const request = new Request("https://api.example/pokemon/25", {
      headers: { Origin: "https://app.example" },
    });

    expect(
      satisfier.satisfyFinal(
        { condition: "origin", value: "https://app.example" },
        { request },
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal(
        { condition: "origin", value: "https://other.example" },
        { request },
      ),
    ).toBe(false);
    expect(
      satisfier.satisfyFinal(
        { condition: "origin", value: "https://app.example" },
        { request: new Request("https://api.example/pokemon/25") },
      ),
    ).toBe(false);
  });

  test("routeSatisfier matches request paths against caveat and policy globs", () => {
    const satisfier = routeSatisfier(["/pokemon/*"]);

    expect(
      satisfier.satisfyFinal(
        { condition: "route", value: "/pokemon/*" },
        { request: new Request("https://api.example/pokemon/25") },
      ),
    ).toBe(true);
    expect(
      satisfier.satisfyFinal(
        { condition: "route", value: "/invoice/*" },
        { request: new Request("https://api.example/pokemon/25") },
      ),
    ).toBe(false);
    expect(
      satisfier.satisfyFinal({ condition: "route", value: "/pokemon/*" }, {}),
    ).toBe(false);
  });
});

describe("built-in caveat satisfiers / attenuation", () => {
  for (const fixture of attenuationChainFixtures) {
    test(fixture.name, () => {
      const satisfier = satisfiersByCondition.get(fixture.condition);
      if (satisfier?.satisfyPrevious === undefined) {
        throw new Error(`missing satisfier for ${fixture.condition}`);
      }

      expect(
        satisfier.satisfyPrevious(
          { condition: fixture.condition, value: fixture.previous },
          { condition: fixture.condition, value: fixture.next },
        ),
      ).toBe(fixture.expected);
    });
  }
});
