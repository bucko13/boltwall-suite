import { describe, expect, test } from "bun:test";

import {
  SPEC_EXAMPLE_MACAROON,
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
} from "@boltwall/test-fixtures";

import { buildAuthorizationHeader, parseAuthorizationHeader } from "../src/headers";

describe("buildAuthorizationHeader / schemes and shapes", () => {
  test("emits L402 by default for a single macaroon string", () => {
    expect(
      buildAuthorizationHeader({
        macaroons: SPEC_EXAMPLE_MACAROON,
        preimage: SPEC_EXAMPLE_PREIMAGE,
      }),
    ).toBe(`L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`);
  });

  test("emits L402 for a single macaroon array", () => {
    expect(
      buildAuthorizationHeader({
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      }),
    ).toBe(`L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`);
  });

  test("emits comma-joined multi-macaroon credentials without whitespace", () => {
    expect(
      buildAuthorizationHeader({
        macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      }),
    ).toBe(
      `L402 ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    );
  });

  test("emits LSAT when legacy mode is requested", () => {
    expect(
      buildAuthorizationHeader({
        macaroons: SPEC_EXAMPLE_MACAROON,
        preimage: SPEC_EXAMPLE_PREIMAGE,
        legacy: true,
      }),
    ).toBe(`LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`);
  });
});

describe("buildAuthorizationHeader / parser round trips", () => {
  test("normalizes string input to the parser array shape", () => {
    const header = buildAuthorizationHeader({
      macaroons: SPEC_EXAMPLE_MACAROON,
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });

    expect(parseAuthorizationHeader(header)).toEqual({
      scheme: "L402",
      macaroons: [SPEC_EXAMPLE_MACAROON],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });
  });

  test("round-trips multi-macaroon input", () => {
    const header = buildAuthorizationHeader({
      macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });

    expect(parseAuthorizationHeader(header)).toEqual({
      scheme: "L402",
      macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });
  });

  test("round-trips legacy LSAT emission", () => {
    const header = buildAuthorizationHeader({
      macaroons: SPEC_EXAMPLE_MACAROON,
      preimage: SPEC_EXAMPLE_PREIMAGE,
      legacy: true,
    });

    expect(parseAuthorizationHeader(header)).toEqual({
      scheme: "LSAT",
      macaroons: [SPEC_EXAMPLE_MACAROON],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });
  });

  test("round-trips 128 deterministic credentials", () => {
    for (let i = 0; i < 128; i += 1) {
      const suffix = i.toString(36).padStart(4, "0");
      const macaroons = [`TWFjYXJvb24${suffix}`, `Q2F2ZWF0${suffix}`];
      const preimage = i.toString(16).padStart(64, "0");
      const header = buildAuthorizationHeader({ macaroons, preimage });

      expect(parseAuthorizationHeader(header)).toEqual({
        scheme: "L402",
        macaroons,
        preimage,
      });
    }
  });
});

describe("buildAuthorizationHeader / invalid inputs", () => {
  test("throws on an empty macaroon array", () => {
    expect(() =>
      buildAuthorizationHeader({
        macaroons: [],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      }),
    ).toThrow("empty-macaroons");
  });

  test("throws on an empty macaroon entry", () => {
    expect(() =>
      buildAuthorizationHeader({
        macaroons: [SPEC_EXAMPLE_MACAROON, ""],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      }),
    ).toThrow("empty-macaroon");
  });
});
