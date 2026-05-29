import { describe, expect, test } from "bun:test";

import { SPEC_EXAMPLE_MACAROON } from "@boltwall/test-fixtures";
import {
  legacyLsatAuthorizationFixtures,
  malformedAuthorizationFixtures,
  multiMacaroonAuthorizationFixtures,
  specAuthorizationFixtures,
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
  type AuthorizationFixture,
} from "@boltwall/test-fixtures";

import { parseAuthorizationHeader } from "../src/headers";

function runFixture(fixture: AuthorizationFixture): void {
  if (fixture.expected.ok) {
    const got = parseAuthorizationHeader(fixture.header);
    expect(got).toEqual(fixture.expected.fields);
  } else {
    expect(() => parseAuthorizationHeader(fixture.header)).toThrow();
  }
}

describe("parseAuthorizationHeader / spec-examples fixtures", () => {
  for (const fixture of specAuthorizationFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthorizationHeader / multi-macaroon fixtures", () => {
  for (const fixture of multiMacaroonAuthorizationFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthorizationHeader / legacy LSAT fixtures", () => {
  for (const fixture of legacyLsatAuthorizationFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthorizationHeader / malformed fixtures", () => {
  for (const fixture of malformedAuthorizationFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthorizationHeader / always-array shape", () => {
  test("single-macaroon credential returns macaroons.length === 1", () => {
    const got = parseAuthorizationHeader(
      `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
    expect(got.macaroons).toHaveLength(1);
    expect(got.macaroons[0]).toBe(SPEC_EXAMPLE_MACAROON);
  });

  test("multi-macaroon credential returns macaroons.length === 2", () => {
    const got = parseAuthorizationHeader(
      `L402 ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
    expect(got.macaroons).toHaveLength(2);
    expect(got.macaroons).toEqual([SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2]);
  });
});

describe("parseAuthorizationHeader / credential grammar", () => {
  for (const header of [
    `L402 ${SPEC_EXAMPLE_MACAROON} :${SPEC_EXAMPLE_PREIMAGE}`,
    `L402 ${SPEC_EXAMPLE_MACAROON}: ${SPEC_EXAMPLE_PREIMAGE}`,
    `L402 ${SPEC_EXAMPLE_MACAROON}, ${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    `L402 ${SPEC_EXAMPLE_MACAROON}:\t${SPEC_EXAMPLE_PREIMAGE}`,
  ]) {
    test(`rejects whitespace inside credential body: ${JSON.stringify(header)}`, () => {
      expect(() => parseAuthorizationHeader(header)).toThrow(
        "invalid-credential-whitespace",
      );
    });
  }
});

describe("parseAuthorizationHeader / HODL empty preimage", () => {
  test("rejects an empty preimage by default", () => {
    expect(() => parseAuthorizationHeader(`LSAT ${SPEC_EXAMPLE_MACAROON}:`)).toThrow(
      "invalid-preimage-length",
    );
  });

  for (const scheme of ["LSAT", "L402"] as const) {
    test(`accepts an empty preimage for ${scheme} when explicitly enabled`, () => {
      const got = parseAuthorizationHeader(`${scheme} ${SPEC_EXAMPLE_MACAROON}:`, {
        allowEmptyPreimage: true,
      });

      expect(got).toEqual({
        scheme,
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: "",
      });
    });
  }
});

describe("parseAuthorizationHeader / case-insensitive scheme tokens", () => {
  for (const variant of ["L402", "l402", "L402".toLowerCase(), "L402".toUpperCase()]) {
    test(`accepts \`${variant}\` (normalizes to L402)`, () => {
      const got = parseAuthorizationHeader(
        `${variant} ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
      );
      expect(got.scheme).toBe("L402");
    });
  }

  for (const variant of ["LSAT", "lsat", "Lsat", "lSaT"]) {
    test(`accepts \`${variant}\` (normalizes to LSAT)`, () => {
      const got = parseAuthorizationHeader(
        `${variant} ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
      );
      expect(got.scheme).toBe("LSAT");
    });
  }
});

describe("parseAuthorizationHeader / preimage hex tolerance", () => {
  test("accepts mixed-case hex", () => {
    const mixed =
      "1234567890ABCDEF1234567890abcdef1234567890ABCDEF1234567890abcdef";
    const got = parseAuthorizationHeader(
      `L402 ${SPEC_EXAMPLE_MACAROON}:${mixed}`,
    );
    expect(got.preimage).toBe(mixed);
  });

  test("rejects hex with non-hex char in middle", () => {
    const bad =
      "1234567890abcdef1234567890abcdez1234567890abcdef1234567890abcdef";
    expect(() =>
      parseAuthorizationHeader(`L402 ${SPEC_EXAMPLE_MACAROON}:${bad}`),
    ).toThrow();
  });
});
