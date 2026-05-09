import { describe, expect, test } from "bun:test";

import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  dualSchemeChallengeFixtures,
  malformedChallengeFixtures,
  specChallengeFixtures,
  type ChallengeFixture,
} from "@boltwall/test-fixtures";

import { parseAuthenticateHeader } from "../src/parse-authenticate-header";

function runFixture(fixture: ChallengeFixture): void {
  if (fixture.expected.ok) {
    const got = parseAuthenticateHeader(fixture.header);
    expect(got).toEqual(fixture.expected.fields);
  } else {
    expect(() => parseAuthenticateHeader(fixture.header)).toThrow();
  }
}

describe("parseAuthenticateHeader / spec-examples fixtures", () => {
  for (const fixture of specChallengeFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthenticateHeader / dual-scheme fixtures", () => {
  for (const fixture of dualSchemeChallengeFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthenticateHeader / malformed fixtures", () => {
  for (const fixture of malformedChallengeFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("parseAuthenticateHeader / array input", () => {
  test("accepts string[] of single-challenge values and returns them in order", () => {
    const got = parseAuthenticateHeader([
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);

    expect(got).toEqual([
      {
        scheme: "LSAT",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
      {
        scheme: "L402",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    ]);
  });

  test("equivalent to comma-folded single string", () => {
    const folded = `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}", L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`;
    const fromArray = parseAuthenticateHeader([
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);
    const fromString = parseAuthenticateHeader(folded);
    expect(fromArray).toEqual(fromString);
  });
});

describe("parseAuthenticateHeader / case-insensitive scheme tokens", () => {
  for (const variant of ["L402", "l402", "L402".toLowerCase(), "L402".toUpperCase()]) {
    test(`accepts \`${variant}\` (case-insensitive, normalizes to L402)`, () => {
      const got = parseAuthenticateHeader(
        `${variant} macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      );
      expect(got).toHaveLength(1);
      expect(got[0]?.scheme).toBe("L402");
    });
  }

  for (const variant of ["LSAT", "lsat", "Lsat", "lSaT"]) {
    test(`accepts \`${variant}\` (case-insensitive, normalizes to LSAT)`, () => {
      const got = parseAuthenticateHeader(
        `${variant} macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      );
      expect(got).toHaveLength(1);
      expect(got[0]?.scheme).toBe("LSAT");
    });
  }
});

describe("parseAuthenticateHeader / param ordering and casing", () => {
  test("accepts invoice-before-macaroon ordering", () => {
    const got = parseAuthenticateHeader(
      `L402 invoice="${SPEC_EXAMPLE_INVOICE}", macaroon="${SPEC_EXAMPLE_MACAROON}"`,
    );
    expect(got).toEqual([
      {
        scheme: "L402",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    ]);
  });

  test("param names are case-insensitive", () => {
    const got = parseAuthenticateHeader(
      `L402 Macaroon="${SPEC_EXAMPLE_MACAROON}", INVOICE="${SPEC_EXAMPLE_INVOICE}"`,
    );
    expect(got).toEqual([
      {
        scheme: "L402",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    ]);
  });
});

describe("parseAuthenticateHeader / additional malformed shapes", () => {
  test("throws on unterminated quoted-string", () => {
    expect(() =>
      parseAuthenticateHeader(`L402 macaroon="${SPEC_EXAMPLE_MACAROON}, invoice="${SPEC_EXAMPLE_INVOICE}"`),
    ).toThrow();
  });

  test("throws on missing 1*SP between scheme and first param", () => {
    expect(() =>
      parseAuthenticateHeader(`L402macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`),
    ).toThrow();
  });

  test("throws on whitespace-only header", () => {
    expect(() => parseAuthenticateHeader("   \t  ")).toThrow();
  });

  test("throws on `Basic` scheme (RFC 7617)", () => {
    expect(() =>
      parseAuthenticateHeader(`Basic realm="example"`),
    ).toThrow();
  });
});
