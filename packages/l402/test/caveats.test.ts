import { describe, expect, test } from "bun:test";

import {
  malformedCaveatFixtures,
  specCaveatFixtures,
  type CaveatFixture,
} from "../../test-fixtures/src/caveats";
import {
  capabilitiesCaveat,
  constraintCaveat,
  parseCaveat,
  serializeCaveat,
  servicesCaveat,
} from "../src/caveats";

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
