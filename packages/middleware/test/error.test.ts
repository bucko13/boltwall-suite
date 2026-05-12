import { describe, expect, test } from "bun:test";

import { L402Error, l402ErrorToStatus } from "../src/core/error";
import type { L402ErrorKind } from "../src/core/error";

describe("l402ErrorToStatus", () => {
  // L402 protocol-specification.md §5 — 402 is ONLY for absent credential.
  test("payment-required maps to 402", () => {
    expect(l402ErrorToStatus("payment-required")).toBe(402);
  });

  // Present-but-invalid credential → 401 per spec.
  test("invalid-credential maps to 401", () => {
    expect(l402ErrorToStatus("invalid-credential")).toBe(401);
  });

  test("invalid-preimage maps to 401", () => {
    expect(l402ErrorToStatus("invalid-preimage")).toBe(401);
  });

  test("caveat-rejected maps to 401", () => {
    expect(l402ErrorToStatus("caveat-rejected")).toBe(401);
  });

  // Backend failure → 502 (gateway error).
  test("invoice-provider-failure maps to 502", () => {
    expect(l402ErrorToStatus("invoice-provider-failure")).toBe(502);
  });

  test("status map is exhaustive — all kinds produce a number", () => {
    const kinds: L402ErrorKind[] = [
      "payment-required",
      "invalid-credential",
      "invalid-preimage",
      "caveat-rejected",
      "invoice-provider-failure",
    ];
    for (const kind of kinds) {
      expect(typeof l402ErrorToStatus(kind)).toBe("number");
    }
  });
});

describe("L402Error", () => {
  test("payment-required carries WWW-Authenticate headers", () => {
    const headers = { "WWW-Authenticate": 'L402 macaroon="abc", invoice="lnbc1"' };
    const err = new L402Error("payment-required", "challenge", { headers });

    expect(err.kind).toBe("payment-required");
    expect(err.headers).toEqual(headers);
    expect(err.message).toBe("challenge");
    expect(err.name).toBe("L402Error");
  });

  test("payment-required headers round-trip through kind and headers fields", () => {
    const wwwAuth = ['L402 macaroon="a", invoice="b"', 'LSAT macaroon="a", invoice="b"'];
    const err = new L402Error("payment-required", "dual challenge", {
      headers: { "WWW-Authenticate": wwwAuth },
    });

    expect(err.headers?.["WWW-Authenticate"]).toEqual(wwwAuth);
    expect(err.kind).toBe("payment-required");
  });

  test("invoice-provider-failure preserves cause", () => {
    const cause = new Error("gRPC deadline exceeded");
    const err = new L402Error("invoice-provider-failure", "LND unreachable", { cause });

    expect(err.cause).toBe(cause);
    expect(err.kind).toBe("invoice-provider-failure");
  });

  test("is instanceof Error", () => {
    const err = new L402Error("caveat-rejected", "service caveat failed");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(L402Error);
  });

  test("kind and headers survive throw/catch across async boundary", async () => {
    const headers = { "WWW-Authenticate": 'L402 macaroon="x", invoice="y"' };

    async function thrower() {
      throw new L402Error("payment-required", "async challenge", { headers });
    }

    let caught: unknown;
    try {
      await thrower();
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(L402Error);
    const l402Err = caught as L402Error;
    expect(l402Err.kind).toBe("payment-required");
    expect(l402Err.headers).toEqual(headers);
  });

  test("errors without options have undefined cause and headers", () => {
    const err = new L402Error("invalid-preimage", "sha256 mismatch");
    expect(err.cause).toBeUndefined();
    expect(err.headers).toBeUndefined();
  });
});
