import { describe, expect, test } from "bun:test";

import {
  InMemoryRootKeyStore,
  L402,
  capabilitiesSatisfier,
  mintMacaroon,
  servicesSatisfier,
  validUntil,
  validUntilSatisfier,
  verifyMacaroon,
} from "@boltwall/l402";
import { MockAdapter } from "@boltwall/adapters/testing";
import type { LightningBackend } from "@boltwall/adapters";
import { hexToBytes } from "@boltwall/internal";
import { specPreimageFixtures } from "@boltwall/test-fixtures";

import { authorizeL402 } from "../src/core/authorize";
import type { L402Config } from "../src/core/types";

// --- Fixture setup ---

const preimageFixture = specPreimageFixtures.find((f) => f.name === "zero-preimage-canonical")!;
const PREIMAGE_HEX = preimageFixture.preimageHex;
const PAYMENT_HASH_HEX = preimageFixture.paymentHashHex;
const AMOUNT_MSAT = 1_000n;

const ROOT_KEY = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const TOKEN_ID = new Uint8Array(32).fill(0x42);

/**
 * Build a config with root key pre-seeded and the fixture invoice settled
 * in MockAdapter so tests can present a valid credential immediately.
 */
/**
 * Wrap MockAdapter so createInvoice returns a valid BOLT11-prefix paymentRequest.
 * L402 challenge construction validates `lnbc/lntb/lnbcrt` prefix; MockAdapter
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

class FixedPaymentHashBackend extends TestBackend {
  override async createInvoice(req: Parameters<MockAdapter["createInvoice"]>[0]) {
    return super.createInvoice({ ...req, paymentHash: PAYMENT_HASH_HEX });
  }
}

class CountingHodlBackend extends TestBackend {
  settleHodlInvoiceCalls = 0;

  override async settleHodlInvoice(preimage: string): Promise<void> {
    this.settleHodlInvoiceCalls += 1;
    return super.settleHodlInvoice(preimage);
  }
}

async function makeConfig(overrides: Partial<L402Config> = {}): Promise<L402Config> {
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

async function makeHodlConfig(
  status: "open" | "held" | "settled" = "held",
): Promise<{ config: L402Config; backend: CountingHodlBackend }> {
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

  const backend = new CountingHodlBackend();
  await backend.createInvoice({
    amountMsat: AMOUNT_MSAT,
    hodl: true,
    paymentHash: PAYMENT_HASH_HEX,
  });
  if (status === "held") {
    backend.hold(PAYMENT_HASH_HEX);
  } else if (status === "settled") {
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);
  }

  return {
    backend,
    config: {
      service: "test-service",
      backend,
      rootKeyStore,
      price: AMOUNT_MSAT,
      hodl: true,
    },
  };
}

/** Build a valid L402 Authorization header for the fixture credential. */
function makeValidAuthHeader(): string {
  const macaroon = mintMacaroon({
    rootKey: ROOT_KEY,
    identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
  });
  const token = L402.fromMacaroon(macaroon);
  token.setPreimage(PREIMAGE_HEX);
  return token.toAuthorizationHeader();
}

function makeHodlAuthHeader(preimage: string = "", scheme: "L402" | "LSAT" = "L402"): string {
  const macaroon = mintMacaroon({
    rootKey: ROOT_KEY,
    identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
  });
  return `${scheme} ${macaroon}:${preimage}`;
}

function makeRequest(
  authHeader?: string,
  init: { method?: string; body?: unknown; url?: string } = {},
): Request {
  const headers = new Headers();
  if (authHeader) headers.set("Authorization", authHeader);
  const requestInit: RequestInit = {
    method: init.method ?? "GET",
    headers,
  };
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
    requestInit.body = JSON.stringify(init.body);
  }
  return new Request(init.url ?? "https://example.com/test", requestInit);
}

async function challengeMacaroon(config: L402Config): Promise<string> {
  const result = await authorizeL402(makeRequest(), config);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected challenge");
  const token = L402.fromHeader(result.response.headers.get("WWW-Authenticate")!);
  expect(token.macaroon).toBeTruthy();
  return token.macaroon;
}

/** Minimal backend that throws on createInvoice. */
function failingBackend(): LightningBackend {
  return {
    kind: "mock",
    capabilities: {
      hodl: false,
      cancelInvoice: false,
      streamingInvoices: false,
      customDescription: false,
    },
    createInvoice: async () => {
      throw new Error("LND unreachable");
    },
    lookupInvoice: async () => {
      throw new Error("not called");
    },
    cancelInvoice: async () => {
      throw new Error("not called");
    },
    settleHodlInvoice: async () => {
      throw new Error("not called");
    },
    subscribeInvoices: async function* () {
      return;
    },
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
    expect(L402.fromHeader(wwwAuth).toAuthenticateHeaders()[1]).toContain("L402 macaroon=");
    expect(wwwAuth.indexOf("LSAT macaroon=")).toBeLessThan(wwwAuth.indexOf("L402 macaroon="));
  });

  test("challengeCompatibility l402-only → only L402 scheme emitted", async () => {
    const config = await makeConfig({ challengeCompatibility: "l402-only" });
    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const wwwAuth = result.response.headers.get("WWW-Authenticate")!;
    expect(L402.fromHeader(wwwAuth).toChallenge()).toContain("L402 macaroon=");
    expect(wwwAuth).not.toContain("LSAT macaroon=");
  });

  test("omits services caveat when no service is configured", async () => {
    const config = await makeConfig({ service: undefined });
    const macaroon = await challengeMacaroon(config);

    const result = await verifyMacaroon({
      macaroons: [macaroon],
      rootKeyStore: config.rootKeyStore,
      satisfiers: [servicesSatisfier("test-service")],
      context: { request: makeRequest(), now: new Date() },
      requirePreimage: false,
    });
    expect(result.ok).toBe(true);
  });

  test("registers middleware-minted service and capability caveats by default", async () => {
    const backend = new FixedPaymentHashBackend();
    const config = await makeConfig({
      service: "pokedex",
      capabilities: ["pokedex-read"],
      backend,
    });
    const macaroon = await challengeMacaroon(config);
    const token = L402.fromMacaroon(macaroon);
    token.setPreimage(PREIMAGE_HEX);
    const authHeader = token.toAuthorizationHeader();

    const acceptedByPublicSatisfiers = await verifyMacaroon({
      macaroons: [macaroon],
      preimage: PREIMAGE_HEX,
      rootKeyStore: config.rootKeyStore,
      satisfiers: [servicesSatisfier("pokedex"), capabilitiesSatisfier("pokedex", "pokedex-read")],
      context: { request: makeRequest(), now: new Date() },
      requirePreimage: false,
    });
    expect(acceptedByPublicSatisfiers.ok).toBe(true);

    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);
    const result = await authorizeL402(makeRequest(authHeader), config);
    expect(result.ok).toBe(true);
  });

  test("preserves caller satisfiers alongside middleware defaults", async () => {
    const backend = new FixedPaymentHashBackend();
    const config = await makeConfig({
      service: "pokedex",
      capabilities: ["pokedex-read"],
      backend,
      caveats: [validUntil({ seconds: 60 })],
      satisfiers: [validUntilSatisfier()],
    });
    const macaroon = await challengeMacaroon(config);
    const token = L402.fromMacaroon(macaroon);
    token.setPreimage(PREIMAGE_HEX);
    const authHeader = token.toAuthorizationHeader();

    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);
    const result = await authorizeL402(makeRequest(authHeader), config);
    expect(result.ok).toBe(true);
  });

  test("challengeCompatibility lsat-only → only LSAT scheme emitted", async () => {
    const config = await makeConfig({ challengeCompatibility: "lsat-only" });
    const result = await authorizeL402(makeRequest(), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    const wwwAuth = result.response.headers.get("WWW-Authenticate")!;
    expect(L402.fromHeader(wwwAuth).toChallenge({ legacy: true })).toContain("LSAT macaroon=");
    expect(wwwAuth).not.toContain("L402 macaroon=");
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

  test("cleartext HTTP is refused before issuing a challenge", async () => {
    const config = await makeConfig();
    const result = await authorizeL402(
      makeRequest(undefined, { url: "http://example.com/test" }),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(result.response.headers.has("WWW-Authenticate")).toBe(false);
    expect(result.error.kind).toBe("bad-request");
  });

  test("allowInsecureHttp permits local development challenges explicitly", async () => {
    const config = await makeConfig({ allowInsecureHttp: true });
    const result = await authorizeL402(
      makeRequest(undefined, { url: "http://example.com/test" }),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(402);
    expect(result.response.headers.has("WWW-Authenticate")).toBe(true);
  });

  test("rate appends a valid-until caveat proportional to paid sats", async () => {
    const originalDateNow = Date.now;
    Date.now = () => Date.UTC(2030, 0, 1, 0, 0, 0);
    try {
      const rootKeyStore = new InMemoryRootKeyStore();
      const config: L402Config = {
        service: "test-service",
        backend: new FixedPaymentHashBackend(),
        rootKeyStore,
        price: 1_000_000n,
        rate: 10,
        satisfiers: [validUntilSatisfier()],
      };

      const macaroon = await challengeMacaroon(config);

      const immediate = await verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE_HEX,
        rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: { request: makeRequest(), now: new Date(Date.now()) },
      });
      expect(immediate.ok).toBe(true);

      const afterGeneratedWindow = await verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE_HEX,
        rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: {
          request: makeRequest(),
          now: new Date(Date.now() + 200_000),
        },
      });
      expect(afterGeneratedWindow).toEqual({
        ok: false,
        reason: "caveat-rejected:valid-until",
      });
    } finally {
      Date.now = originalDateNow;
    }
  });

  test("static valid-until caveat and rate-generated valid-until caveat are additive", async () => {
    const originalDateNow = Date.now;
    Date.now = () => Date.UTC(2030, 0, 1, 0, 0, 0);
    try {
      const rootKeyStore = new InMemoryRootKeyStore();
      const config: L402Config = {
        service: "test-service",
        backend: new FixedPaymentHashBackend(),
        rootKeyStore,
        price: 1_000_000n,
        rate: 10,
        caveats: [validUntil({ iso: "2030-01-01T00:00:50.000Z" })],
        satisfiers: [validUntilSatisfier()],
      };

      const macaroon = await challengeMacaroon(config);

      const beforeStaticExpiry = await verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE_HEX,
        rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: {
          request: makeRequest(),
          now: new Date(Date.now() + 40_000),
        },
      });
      expect(beforeStaticExpiry.ok).toBe(true);

      const afterStaticExpiry = await verifyMacaroon({
        macaroons: [macaroon],
        preimage: PREIMAGE_HEX,
        rootKeyStore,
        satisfiers: [validUntilSatisfier()],
        context: {
          request: makeRequest(),
          now: new Date(Date.now() + 60_000),
        },
      });
      expect(afterStaticExpiry).toEqual({
        ok: false,
        reason: "caveat-rejected:valid-until",
      });
    } finally {
      Date.now = originalDateNow;
    }
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
    const config = await makeConfig({
      onPaid: () => {
        called = true;
      },
    });
    const result = await authorizeL402(makeRequest(makeValidAuthHeader()), config);
    expect(result.ok).toBe(true);
    expect(called).toBe(true);
  });
});

describe("authorizeL402 — HODL flow", () => {
  test("hodl:true missing paymentHash → 400 bad-request", async () => {
    const { config } = await makeHodlConfig("open");
    const result = await authorizeL402(
      makeRequest(undefined, { method: "POST", body: {} }),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(result.error.kind).toBe("bad-request");
  });

  test("hodl:true missing credential with body paymentHash → 402 HODL challenge", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    const backend = new TestBackend();
    const config: L402Config = {
      service: "test-service",
      backend,
      rootKeyStore,
      price: AMOUNT_MSAT,
      hodl: true,
    };

    const result = await authorizeL402(
      makeRequest(undefined, { method: "POST", body: { paymentHash: PAYMENT_HASH_HEX } }),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(402);
    const lookup = await backend.lookupInvoice(PAYMENT_HASH_HEX);
    expect(lookup.status).toBe("open");
    expect(lookup.amountMsat).toBe(AMOUNT_MSAT);
  });

  test("hodl:true held invoice + no preimage → authorized", async () => {
    const { config } = await makeHodlConfig("held");
    const result = await authorizeL402(makeRequest(makeHodlAuthHeader("")), config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.context.paymentHash).toBe(PAYMENT_HASH_HEX);
  });

  test("hodl:true held invoice + valid preimage → settles once and authorizes", async () => {
    const { config, backend } = await makeHodlConfig("held");
    const result = await authorizeL402(makeRequest(makeHodlAuthHeader(PREIMAGE_HEX)), config);

    expect(result.ok).toBe(true);
    expect(backend.settleHodlInvoiceCalls).toBe(1);
    await expect(backend.lookupInvoice(PAYMENT_HASH_HEX)).resolves.toMatchObject({
      status: "settled",
    });
  });

  test("hodl:true settled invoice → 401 expired credential", async () => {
    const { config, backend } = await makeHodlConfig("settled");
    const result = await authorizeL402(makeRequest(makeHodlAuthHeader(PREIMAGE_HEX)), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.error.kind).toBe("invalid-credential");
    expect(backend.settleHodlInvoiceCalls).toBe(0);
  });

  test("hodl:false held invoice → 401 invalid credential", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(TOKEN_ID, ROOT_KEY);
    const backend = new TestBackend();
    await backend.createInvoice({
      amountMsat: AMOUNT_MSAT,
      hodl: true,
      paymentHash: PAYMENT_HASH_HEX,
    });
    backend.hold(PAYMENT_HASH_HEX);

    const config: L402Config = {
      service: "test-service",
      backend,
      rootKeyStore,
      price: AMOUNT_MSAT,
    };
    const result = await authorizeL402(makeRequest(makeHodlAuthHeader(PREIMAGE_HEX)), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.error.kind).toBe("invalid-credential");
  });
});

// --- Invalid credential tests (401) ---

describe("authorizeL402 — invalid credential (401)", () => {
  test("present credential for an open invoice → 401 invalid-credential", async () => {
    const config = await makeConfig();
    const backend = config.backend as TestBackend;
    await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });

    const result = await authorizeL402(makeRequest(makeValidAuthHeader()), config);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(result.error.kind).toBe("invalid-credential");
  });

  test("cleartext HTTP is refused before accepting a credential", async () => {
    const config = await makeConfig();
    const result = await authorizeL402(
      makeRequest(makeValidAuthHeader(), { url: "http://example.com/test" }),
      config,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(400);
    expect(result.error.kind).toBe("bad-request");
  });

  test("mismatched preimage → 401 invalid-preimage", async () => {
    const config = await makeConfig();
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
    });
    const wrongPreimage = "ff".repeat(32);
    const authHeader = new L402({
      macaroons: macaroon,
      paymentPreimage: wrongPreimage,
    }).toAuthorizationHeader();

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
