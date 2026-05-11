import { describe, expect, test } from "bun:test";

import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  SPEC_EXAMPLE_PREIMAGE,
  ZERO_PREIMAGE_PAYMENT_HASH_HEX,
} from "@boltwall/test-fixtures";

import {
  InMemoryRootKeyStore,
  buildAuthenticateHeaders,
  buildAuthorizationHeader,
  decodeBolt11Invoice,
  mintMacaroon,
  parseAuthenticateHeader,
  parseAuthorizationHeader,
  servicesCaveat,
  servicesSatisfier,
  verifyMacaroon,
} from "../../src";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

describe("README quick starts", () => {
  test("mirrors the documented parseAuthenticateHeader example", () => {
    const header = `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`;
    const challenges = parseAuthenticateHeader(header);

    expect(challenges[0]?.scheme).toBe("L402");
    expect(challenges[0]?.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
    expect(challenges[0]?.invoice).toBe(SPEC_EXAMPLE_INVOICE);
  });

  test("mirrors the documented buildAuthenticateHeaders example", () => {
    const headers = buildAuthenticateHeaders({
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
    });
    const responseHeaders = new Headers();

    for (const value of headers) {
      responseHeaders.append("WWW-Authenticate", value);
    }

    expect(responseHeaders.get("WWW-Authenticate")).toContain("LSAT");
    expect(responseHeaders.get("WWW-Authenticate")).toContain("L402");
  });

  test("mirrors the documented Authorization retry example", () => {
    const authorization = buildAuthorizationHeader({
      macaroons: [SPEC_EXAMPLE_MACAROON],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    });

    const credential = parseAuthorizationHeader(authorization);

    expect(credential.scheme).toBe("L402");
    expect(credential.macaroons).toHaveLength(1);
    expect(credential.preimage).toHaveLength(64);
  });

  test("mirrors the documented decodeBolt11Invoice example", () => {
    const decoded = decodeBolt11Invoice(SPEC_EXAMPLE_INVOICE);

    expect(decoded.paymentHashHex).toHaveLength(64);
    expect(typeof decoded.amountMsat).toBe("bigint");
    expect(decoded.expiresAt).toBeInstanceOf(Date);
  });

  test("mirrors the documented mintMacaroon and verifyMacaroon example", async () => {
    const rootKey = new Uint8Array(32);
    const paymentHash = hexToBytes(ZERO_PREIMAGE_PAYMENT_HASH_HEX);
    const tokenId = new Uint8Array(32);

    const macaroon = mintMacaroon({
      rootKey,
      identifier: { version: 0, paymentHash, tokenId },
      caveats: [servicesCaveat([{ name: "pokedex", tier: 0 }])],
    });

    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(tokenId, rootKey);

    const result = await verifyMacaroon({
      macaroons: [macaroon],
      preimage: "0000000000000000000000000000000000000000000000000000000000000000",
      rootKeyStore,
      satisfiers: [servicesSatisfier("pokedex")],
      context: {},
    });

    expect(result.ok).toBe(true);
  });
});
