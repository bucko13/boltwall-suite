import { describe, expect, test } from "bun:test";

import {
  malformedIdentifierFixtures,
  specIdentifierFixtures,
  type IdentifierFixture,
} from "../../test-fixtures/src/identifiers";
import { decodeIdentifier } from "../src/identifier";

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function runFixture(fixture: IdentifierFixture): void {
  if (fixture.expected.ok) {
    const got = decodeIdentifier(fixture.macaroon);
    expect(got.version).toBe(fixture.expected.fields.version);
    expect(bytesToHex(got.paymentHash)).toBe(fixture.expected.fields.paymentHashHex);
    expect(bytesToHex(got.tokenId)).toBe(fixture.expected.fields.tokenIdHex);
  } else {
    expect(() => decodeIdentifier(fixture.macaroon)).toThrow(
      fixture.expected.reason,
    );
  }
}

describe("decodeIdentifier / spec identifier fixtures", () => {
  for (const fixture of specIdentifierFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("decodeIdentifier / malformed identifier fixtures", () => {
  for (const fixture of malformedIdentifierFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("decodeIdentifier / malformed macaroon wrappers", () => {
  test("throws on non-base64 input", () => {
    expect(() => decodeIdentifier("not base64!?")).toThrow("invalid-macaroon-base64");
  });

  test("throws when the macaroon is not V2 binary format", () => {
    expect(() => decodeIdentifier("AQ==")).toThrow("invalid-macaroon-v2");
  });

  test("throws when the V2 macaroon header has no identifier field", () => {
    expect(() => decodeIdentifier("AgA=")).toThrow("missing-identifier");
  });
});
