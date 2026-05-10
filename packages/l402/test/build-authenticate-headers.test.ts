import { describe, expect, test } from "bun:test";

import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
} from "@boltwall/test-fixtures";

import { buildAuthenticateHeaders } from "../src";
import { parseAuthenticateHeader } from "../src/parse-authenticate-header";

describe("buildAuthenticateHeaders / compatibility modes", () => {
  test("defaults to dual LSAT-first emission per spec §10", () => {
    const got = buildAuthenticateHeaders({
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
    });

    expect(got).toEqual([
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);
  });

  test("emits only L402 when requested", () => {
    const got = buildAuthenticateHeaders({
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
      compatibility: "l402-only",
    });

    expect(got).toEqual([
      `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);
  });

  test("emits only LSAT when requested", () => {
    const got = buildAuthenticateHeaders({
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
      compatibility: "lsat-only",
    });

    expect(got).toEqual([
      `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    ]);
  });
});

describe("buildAuthenticateHeaders / parser round trips", () => {
  test("every emitted challenge parses back to matching fields", () => {
    const headers = buildAuthenticateHeaders({
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
    });

    expect(parseAuthenticateHeader(headers)).toEqual([
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

  test("round-trips 128 deterministic macaroon/invoice pairs", () => {
    for (let i = 0; i < 128; i += 1) {
      const suffix = i.toString(36).padStart(4, "0");
      const macaroon = `TWFjYXJvb24${suffix}`;
      const invoice = `lnbc${i + 1}n1p${i.toString(36)}example`;
      const headers = buildAuthenticateHeaders({ macaroon, invoice });

      expect(parseAuthenticateHeader(headers)).toEqual([
        { scheme: "LSAT", macaroon, invoice },
        { scheme: "L402", macaroon, invoice },
      ]);
    }
  });
});
