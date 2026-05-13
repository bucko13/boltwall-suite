import { describe, expect, test } from "bun:test";

import {
  InMemoryRootKeyStore,
  buildAuthorizationHeader,
  mintMacaroon,
  parseAuthenticateHeader,
} from "@boltwall/l402";
import { MockAdapter } from "@boltwall/adapters/testing";
import type { LightningBackend } from "@boltwall/adapters";
import { specPreimageFixtures } from "@boltwall/test-fixtures";

import { authorizeL402 } from "../src/core/authorize";
import type { L402Config } from "../src/core/types";

// --- Fixture setup ---

const preimageFixture = specPreimageFixtures.find((f) => f.name === "zero-preimage-canonical")!;
const PREIMAGE_HEX = preimageFixture.preimageHex;
const PAYMENT_HASH_HEX = preimageFixture.paymentHashHex;
const AMOUNT_MSAT = 1_000n;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const ROOT_KEY = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const TOKEN_ID = new Uint8Array(32).fill(0x42);

/**
 * Build a config with root key pre-seeded and the fixture invoice settled
 * in MockAdapter so tests can present a valid credential immediately.
 */
/**
 * Wrap MockAdapter so createInvoice returns a valid BOLT11-prefix paymentRequest.
 * buildAuthenticateHeaders validates `lnbc/lntb/lnbcrt` prefix; MockAdapter
 * produces `mockbolt11_...` which fails that check.
 */
class TestBackend extends MockAdapter {
  override async createInvoice(req: Parameters<MockAdapter["createInvoice"]>[0]) {
    const result = await super.createInvoice(req);
    return {
      ...result,
      paymentRequest: `lnbcrt${result.amountMsat}n1${result.paymentHash}`,
    };
  }
}

async function makeConfig(
  overrides: Partial<L402Config> = {},
): Promise<L402Config> {
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

  const backend = new TestBackend();
  // Seed the invoice with a known payment hash so we can mint a macaroon
  // against it. MockAdapter accepts an explicit paymentHash in createInvoice.
  await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
  backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

  return {
    service: "test-service",
    backend,
    rootKeyStore,
    price: AMOUNT_MSAT,
    ...overrides,
  };
}

/** Build a valid L402 Authorization header for the fixture credential. */
function makeValidAuthHeader(): string {
  const macaroon = mintMacaroon({
    rootKey: ROOT_KEY,
    identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
  });
  return buildAuthorizationHeader({ macaroons: macaroon, preimage: PREIMAGE_HEX });
}

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  return new Request("https://example.com/test", { headers });
}

/** Minimal backend that throws on createInvoice. */
function failingBackend(): LightningBackend {
  return {
    kind: "mock",
    capabilities: { hodl: false, cancelInvoice: false, streamingInvoices: false, customDescription: false },
    createInvoice: async () => { throw new Error("LND unreachable"); },
    lookupInvoice: async () => { throw new Error("not called"); },
    cancelInvoice: async () => { throw new Error("not called"); },
    settleHodlInvoice: async () => { throw new Error("not called"); },
    subscribeInvoices: async function* () { return; },
  };
}

// --- Missing credential tests ---

describe("authorizeL402 — missing credential (402)", () => {
  test("no Authorization → 402 + dual LSAT-first/L402-second WWW-Authenticate", async () => {
    // L402 protocol-specification.md §10 — dual mode is default.
    const config = await makeConfig();
    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(402);
    expect(result.error.kind).toBe("payment-required");

    const wwwAuth = result.response.headers.get("WWW-Authenticate")!;
    expect(wwwAuth).toBeTruthy();
    const challenges = parseAuthenticateHeader(wwwAuth);
    expect(challenges.length).toBeGreaterThanOrEqual(2);
    expect(challenges[0].scheme).toBe("LSAT");
    expect(challenges[1].scheme).toBe("L402");
  });

  test("challengeCompatibility l402-only → only L402 scheme emitted", async () => {
    const config = await makeConfig({ challengeCompatibility: "l402-only" });
    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const challenges = parseAuthenticateHeader(
      result.response.headers.get("WWW-Authenticate")!,
    );
    expect(challenges.every((c) => c.scheme === "L402")).toBe(true);
  });

  test("challengeCompatibility lsat-only → only LSAT scheme emitted", async () => {
    const config = await makeConfig({ challengeCompatibility: "lsat-only" });
    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const challenges = parseAuthenticateHeader(
      result.response.headers.get("WWW-Authenticate")!,
    );
    expect(challenges.every((c) => c.scheme === "LSAT")).toBe(true);
  });

  test("Bearer scheme treated as absent → 402 challenge", async () => {
    const config = await makeConfig();
    const result = await authorizeL402(makeRequest("Bearer some-token"), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(402);
    expect(result.error.kind).toBe("payment-required");
  });

  test("backend createInvoice failure → 502 invoice-provider-failure", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    const config: L402Config = {
      service: "test-service",
      backend: failingBackend(),
      rootKeyStore,
      price: AMOUNT_MSAT,
    };

    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(502);
    expect(result.error.kind).toBe("invoice-provider-failure");
  });
});

// --- Valid credential tests ---

describe("authorizeL402 — valid credential (200)", () => {
  test("valid L402 macaroon + matching preimage → ok: true with context", async () => {
    const config = await makeConfig();
    const result = await authorizeL402(makeRequest(makeValidAuthHeader()), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.paymentHash).toBe(PAYMENT_HASH_HEX);
    expect(result.context.identifier.version).toBe(0);
  });

  test("LSAT scheme Authorization header also accepted", async () => {
    const config = await makeConfig();
    const lsatHeader = makeValidAuthHeader().replace(/^L402\s/, "LSAT ");
    const result = await authorizeL402(makeRequest(lsatHeader), config);
    expect(result.ok).toBe(true);
  });

  test("onPaid callback is invoked on successful authorization", async () => {
    let called = false;
    const config = await makeConfig({ onPaid: () => { called = true; } });
    const result = await authorizeL402(makeRequest(makeValidAuthHeader()), config);
    expect(result.ok).toBe(true);
    expect(called).toBe(true);
  });
});

// --- Invalid credential tests (401) ---

describe("authorizeL402 — invalid credential (401)", () => {
  test("mismatched preimage → 401 invalid-preimage", async () => {
    const config = await makeConfig();
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
    });
    const wrongPreimage = "ff".repeat(32);
    const authHeader = buildAuthorizationHeader({ macaroons: macaroon, preimage: wrongPreimage });

    const result = await authorizeL402(makeRequest(authHeader), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.error.kind).toBe("invalid-preimage");
  });

  test("amount mismatch (price changed) → 401 invalid-credential with mismatch reason", async () => {
    // Server price is now 2000 but invoice was created for 1000.
    const config = await makeConfig({ price: 2_000n });
    const result = await authorizeL402(makeRequest(makeValidAuthHeader()), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.error.kind).toBe("invalid-credential");
    // Security: amount mismatch must surface in the error message.
    expect(result.error.message).toContain("mismatch");
  });
});
