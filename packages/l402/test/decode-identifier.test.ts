import { describe, expect, test } from "bun:test";

import {
  malformedIdentifierFixtures,
  specIdentifierFixtures,
  type IdentifierFixture,
} from "../../test-fixtures/src/identifiers";
import { Identifier } from "../src/identifier";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function runFixture(fixture: IdentifierFixture): void {
  if (fixture.expected.ok) {
    const got = Identifier.fromMacaroon(fixture.macaroon);
    expect(got.version).toBe(fixture.expected.fields.version);
    expect(bytesToHex(got.paymentHash)).toBe(fixture.expected.fields.paymentHashHex);
    expect(bytesToHex(got.tokenId)).toBe(fixture.expected.fields.tokenIdHex);
  } else {
    expect(() => Identifier.fromMacaroon(fixture.macaroon)).toThrow(
      fixture.expected.reason,
    );
  }
}

describe("Identifier.fromMacaroon / spec identifier fixtures", () => {
  for (const fixture of specIdentifierFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("Identifier.fromMacaroon / malformed identifier fixtures", () => {
  for (const fixture of malformedIdentifierFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("Identifier.fromMacaroon / malformed macaroon wrappers", () => {
  test("throws on non-base64 input", () => {
    expect(() => Identifier.fromMacaroon("not base64!?")).toThrow("invalid-macaroon-base64");
  });

  test("throws when the macaroon is not V2 binary format", () => {
    expect(() => Identifier.fromMacaroon("AQ==")).toThrow("invalid-macaroon-v2");
  });

  test("throws when the V2 macaroon header has no identifier field", () => {
    expect(() => Identifier.fromMacaroon("AgA=")).toThrow("missing-identifier");
  });
});
