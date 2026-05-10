import { describe, expect, test } from "bun:test";

import { SPEC_EXAMPLE_INVOICE, SPEC_EXAMPLE_MACAROON } from "@boltwall/test-fixtures";

import { parseAuthenticateHeader } from "../../src";

describe("README quick start / parse an L402 challenge", () => {
  test("mirrors the documented parseAuthenticateHeader example", () => {
    const header = `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`;
    const challenges = parseAuthenticateHeader(header);

    expect(challenges[0]?.scheme).toBe("L402");
    expect(challenges[0]?.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
    expect(challenges[0]?.invoice).toBe(SPEC_EXAMPLE_INVOICE);
  });
});
