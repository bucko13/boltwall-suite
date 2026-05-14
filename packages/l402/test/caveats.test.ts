import { describe, expect, test } from "bun:test";

import {
  malformedCaveatFixtures,
  specCaveatFixtures,
  type CaveatFixture,
} from "../../test-fixtures/src/caveats";
import {
  capabilitiesCaveat,
  constraintCaveat,
  ipCaveat,
  originCaveat,
  parseCaveat,
  routeCaveat,
  serializeCaveat,
  servicesCaveat,
  validUntil,
} from "../src/caveats";
import {
  originSatisfier,
  routeSatisfier,
  validUntilSatisfier,
} from "../src/satisfiers";

function runFixture(fixture: CaveatFixture): void {
  if (fixture.expected.ok) {
    const got = parseCaveat(fixture.input);
    expect(got).toEqual(fixture.expected.caveat);
    expect(serializeCaveat(got)).toBe(fixture.expected.serialized);
  } else {
    expect(() => parseCaveat(fixture.input)).toThrow(fixture.expected.reason);
  }
}

describe("caveats / spec fixtures", () => {
  for (const fixture of specCaveatFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("caveats / malformed fixtures", () => {
  for (const fixture of malformedCaveatFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("caveats / helper constructors", () => {
  test("servicesCaveat serializes to the spec services form", () => {
    const caveat = servicesCaveat([
      { name: "pokedex", tier: 0 },
      { name: "proxy", tier: 0 },
    ]);

    expect(caveat).toEqual({
      condition: "services",
      value: "pokedex:0,proxy:0",
    });
    expect(parseCaveat(serializeCaveat(caveat))).toEqual(caveat);
  });

  test("capabilitiesCaveat serializes to the spec service capabilities form", () => {
    const caveat = capabilitiesCaveat("pokedex", ["read", "write"]);

    expect(caveat).toEqual({
      condition: "pokedex_capabilities",
      value: "read,write",
    });
    expect(parseCaveat(serializeCaveat(caveat))).toEqual(caveat);
  });

  test("constraintCaveat serializes to the spec capability constraint form", () => {
    const caveat = constraintCaveat("request", "max-count", "10");

    expect(caveat).toEqual({
      condition: "request_max-count",
      value: "10",
    });
    expect(parseCaveat(serializeCaveat(caveat))).toEqual(caveat);
  });

  test("serializeCaveat rejects empty conditions", () => {
    expect(() => serializeCaveat({ condition: " ", value: "x" })).toThrow(
      "empty-caveat-condition",
    );
  });
});

describe("caveats / validUntil factory", () => {
  test("{ seconds } produces valid-until caveat accepted by validUntilSatisfier", () => {
    const caveat = validUntil({ seconds: 3600 });
    expect(caveat.condition).toBe("valid-until");
    expect(new Date(caveat.value).getTime()).toBeGreaterThan(Date.now());

    const satisfier = validUntilSatisfier();
    expect(satisfier.satisfyFinal(caveat, { now: new Date() })).toBe(true);
  });

  test("{ iso } produces caveat with exact value", () => {
    const iso = "2030-01-01T00:00:00.000Z";
    const caveat = validUntil({ iso });
    expect(caveat).toEqual({ condition: "valid-until", value: iso });

    const satisfier = validUntilSatisfier();
    expect(satisfier.satisfyFinal(caveat, { now: new Date("2026-01-01") })).toBe(true);
  });

  test("{ date } uses .toISOString()", () => {
    const date = new Date("2030-06-15T12:00:00.000Z");
    const caveat = validUntil({ date });
    expect(caveat).toEqual({ condition: "valid-until", value: date.toISOString() });
  });

  test("expired caveat rejected by satisfier", () => {
    const caveat = validUntil({ iso: "2020-01-01T00:00:00.000Z" });
    const satisfier = validUntilSatisfier();
    expect(satisfier.satisfyFinal(caveat, { now: new Date() })).toBe(false);
  });
});

describe("caveats / originCaveat factory", () => {
  test("single origin accepted by originSatisfier", () => {
    const caveat = originCaveat("https://example.com");
    expect(caveat).toEqual({ condition: "origin", value: "https://example.com" });

    const satisfier = originSatisfier(["https://example.com"]);
    const request = new Request("https://example.com/api", {
      headers: { Origin: "https://example.com" },
    });
    expect(satisfier.satisfyFinal(caveat, { request })).toBe(true);
  });

  test("array of origins comma-joined", () => {
    const caveat = originCaveat(["https://a.com", "https://b.com"]);
    expect(caveat).toEqual({ condition: "origin", value: "https://a.com,https://b.com" });
  });

  test("origin not in caveat rejected", () => {
    const caveat = originCaveat("https://example.com");
    const satisfier = originSatisfier(["https://other.com"]);
    const request = new Request("https://other.com/api", {
      headers: { Origin: "https://other.com" },
    });
    expect(satisfier.satisfyFinal(caveat, { request })).toBe(false);
  });
});

describe("caveats / ipCaveat factory", () => {
  test("builds and round-trips the legacy IP binding shape", () => {
    const caveat = ipCaveat("1.2.3.4");

    expect(caveat).toEqual({ condition: "ip", value: "1.2.3.4" });
    expect(parseCaveat(serializeCaveat(caveat))).toEqual(caveat);
  });

  test("rejects empty IP values", () => {
    expect(() => ipCaveat(" ")).toThrow("invalid-ip-caveat");
  });
});

describe("caveats / routeCaveat factory", () => {
  test("single pattern accepted by routeSatisfier", () => {
    const caveat = routeCaveat("/api/*");
    expect(caveat).toEqual({ condition: "route", value: "/api/*" });

    const satisfier = routeSatisfier(["/api/*"]);
    const request = new Request("https://example.com/api/foo");
    expect(satisfier.satisfyFinal(caveat, { request })).toBe(true);
  });

  test("array of patterns comma-joined", () => {
    const caveat = routeCaveat(["/api/*", "/v1/*"]);
    expect(caveat).toEqual({ condition: "route", value: "/api/*,/v1/*" });
  });

  test("non-matching route rejected", () => {
    const caveat = routeCaveat("/api/*");
    const satisfier = routeSatisfier(["/api/*"]);
    const request = new Request("https://example.com/admin/secret");
    expect(satisfier.satisfyFinal(caveat, { request })).toBe(false);
  });
});
