/**
 * Express adapter integration tests (bw-zxk.3).
 *
 * Uses supertest against a real Express app with MockAdapter. Tests cover
 * both Express 4 and Express 5 (same middleware, both handled by the promise
 * chain + next(err) pattern).
 */
import { describe, expect, test } from "bun:test";
import express from "express";
import supertest from "supertest";

import {
  InMemoryRootKeyStore,
  buildAuthorizationHeader,
  mintMacaroon,
  parseAuthenticateHeader,
} from "@boltwall/l402";
import { MockAdapter } from "@boltwall/adapters/testing";
import { specPreimageFixtures } from "@boltwall/test-fixtures";

import { boltwall } from "../src/express/index";

// --- Fixtures ---

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

/** MockAdapter subclass with valid lnbcrt-prefix payment requests. */
class TestBackend extends MockAdapter {
  override async createInvoice(req: Parameters<MockAdapter["createInvoice"]>[0]) {
    const result = await super.createInvoice(req);
    return { ...result, paymentRequest: `lnbcrt${result.amountMsat}n1${result.paymentHash}` };
  }
}

function makeValidAuthHeader(): string {
  const macaroon = mintMacaroon({
    rootKey: ROOT_KEY,
    identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
  });
  return buildAuthorizationHeader({ macaroons: macaroon, preimage: PREIMAGE_HEX });
}

async function buildApp() {
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

  const backend = new TestBackend();
  await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
  backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

  const app = express();
  app.use(
    "/paid",
    boltwall({ service: "test-service", backend, rootKeyStore, price: AMOUNT_MSAT }),
    (_req, res) => {
      res.json({ ok: true });
    },
  );

  return { app, backend };
}

// --- Tests ---

describe("Express adapter — GET /paid", () => {
  test("no Authorization → 402 with dual LSAT-first/L402-second WWW-Authenticate", async () => {
    const { app } = await buildApp();
    const res = await supertest(app).get("/paid");

    expect(res.status).toBe(402);
    const wwwAuth = res.headers["www-authenticate"] as string;
    expect(wwwAuth).toBeTruthy();

    // Build a single string from potentially repeated headers for parsing.
    const challenges = parseAuthenticateHeader(wwwAuth);
    expect(challenges.length).toBeGreaterThanOrEqual(2);
    expect(challenges[0].scheme).toBe("LSAT");
    expect(challenges[1].scheme).toBe("L402");
  });

  test("valid credential → 200 and req.l402 populated", async () => {
    const { app } = await buildApp();

    // Re-build the app to capture req.l402 in the handler.
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(TOKEN_ID, ROOT_KEY);
    const backend = new TestBackend();
    await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    let capturedL402: unknown;
    const app2 = express();
    app2.use(
      "/paid",
      boltwall({ service: "test-service", backend, rootKeyStore, price: AMOUNT_MSAT }),
      (req, res) => {
        capturedL402 = req.l402;
        res.json({ ok: true, paymentHash: req.l402?.paymentHash });
      },
    );

    const res = await supertest(app2).get("/paid").set("Authorization", makeValidAuthHeader());
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.paymentHash).toBe(PAYMENT_HASH_HEX);
    expect(capturedL402).toBeTruthy();
  });

  test("LSAT scheme Authorization also accepted → 200", async () => {
    const { app } = await buildApp();
    const lsatHeader = makeValidAuthHeader().replace(/^L402\s/, "LSAT ");
    const res = await supertest(app).get("/paid").set("Authorization", lsatHeader);
    expect(res.status).toBe(200);
  });

  test("tampered macaroon → 401", async () => {
    const { app } = await buildApp();
    const tampered = makeValidAuthHeader().slice(0, -2) + "XX";
    const res = await supertest(app).get("/paid").set("Authorization", tampered);
    expect(res.status).toBe(401);
  });

  test("mismatched preimage → 401", async () => {
    const { app } = await buildApp();
    const macaroon = mintMacaroon({
      rootKey: ROOT_KEY,
      identifier: { version: 0, paymentHash: hexToBytes(PAYMENT_HASH_HEX), tokenId: TOKEN_ID },
    });
    const wrongHeader = buildAuthorizationHeader({ macaroons: macaroon, preimage: "ff".repeat(32) });
    const res = await supertest(app).get("/paid").set("Authorization", wrongHeader);
    expect(res.status).toBe(401);
  });

  test("amount mismatch → 401", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    await rootKeyStore.put(TOKEN_ID, ROOT_KEY);
    const backend = new TestBackend();
    await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    const app = express();
    // Config price is 2000 but invoice is 1000.
    app.use(
      "/paid",
      boltwall({ service: "test-service", backend, rootKeyStore, price: 2_000n }),
      (_req, res) => res.json({ ok: true }),
    );

    const res = await supertest(app).get("/paid").set("Authorization", makeValidAuthHeader());
    expect(res.status).toBe(401);
  });

  test("backend createInvoice failure → 502", async () => {
    const rootKeyStore = new InMemoryRootKeyStore();
    const failingBackend = {
      kind: "mock" as const,
      capabilities: { hodl: false, cancelInvoice: false, streamingInvoices: false, customDescription: false },
      createInvoice: async () => { throw new Error("LND down"); },
      lookupInvoice: async () => { throw new Error("not called"); },
      cancelInvoice: async () => {},
      settleHodlInvoice: async () => {},
      subscribeInvoices: async function* () { return; },
    };

    const app = express();
    app.use(
      "/paid",
      boltwall({ service: "test-service", backend: failingBackend, rootKeyStore, price: AMOUNT_MSAT }),
      (_req, res) => res.json({ ok: true }),
    );

    const res = await supertest(app).get("/paid");
    expect(res.status).toBe(502);
  });
});
