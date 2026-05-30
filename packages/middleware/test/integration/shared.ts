/**
 * Shared middleware integration scenarios.
 *
 * Both express4.test.ts and express5.test.ts import `defineIntegrationSuite`
 * so the scenario set stays in sync across Express versions.
 */
import { describe, expect, test } from "bun:test";
import express from "express";
import supertest from "supertest";

import {
  InMemoryRootKeyStore,
  L402,
  mintMacaroon,
  validUntilSatisfier,
} from "@boltwall/l402";
import { BackendCapabilityError, type LightningBackend } from "@boltwall/adapters";
import { MockAdapter } from "@boltwall/adapters/testing";
import { hexToBytes } from "@boltwall/internal";
import { specPreimageFixtures } from "@boltwall/test-fixtures";

import { boltwall, validUntil } from "../../src/express/index.js";

// --- Fixtures ---

const fixture = specPreimageFixtures.find((f) => f.name === "zero-preimage-canonical")!;
export const PREIMAGE_HEX = fixture.preimageHex;
export const PAYMENT_HASH_HEX = fixture.paymentHashHex;
const AMOUNT_MSAT = 1_000n;

const ROOT_KEY = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const TOKEN_ID = new Uint8Array(32).fill(0x42);

/**
 * TestBackend overrides createInvoice to:
 * 1. Return an lnbcrt-prefix payment request (passes BOLT11 HRP validation).
 * 2. Always pin to PAYMENT_HASH_HEX so tests can pre-settle and build credentials.
 */
class IntegrationBackend extends MockAdapter {
  settleHodlInvoiceCalls = 0;

  override async createInvoice(req: Parameters<MockAdapter["createInvoice"]>[0]) {
    const result = await super.createInvoice({ ...req, paymentHash: PAYMENT_HASH_HEX });
    return { ...result, paymentRequest: `lnbcrt${result.amountMsat}n1${result.paymentHash}` };
  }

  override async settleHodlInvoice(preimage: string): Promise<void> {
    this.settleHodlInvoiceCalls += 1;
    return super.settleHodlInvoice(preimage);
  }
}

// --- App builder ---

interface AppOptions {
  challengeCompatibility?: "dual" | "l402-only" | "lsat-only";
  satisfiers?: ReturnType<typeof validUntilSatisfier>[];
  hodl?: true;
  allowInsecureHttp?: boolean;
}

type ExpressFactory = typeof express;

export async function buildIntegrationApp(
  options: AppOptions = {},
  expressFactory: ExpressFactory = express,
) {
  const backend = new IntegrationBackend();
  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

  const app = expressFactory();
  app.use(express.json());
  let capturedL402: unknown;
  app.use(
    "/paid",
    boltwall({
      service: "test-service",
      backend,
      rootKeyStore,
      price: AMOUNT_MSAT,
      allowInsecureHttp: true,
      ...options,
    }),
    (req: express.Request, res: express.Response) => {
      capturedL402 = req.l402;
      res.json({ ok: true, paymentHash: req.l402?.paymentHash });
    },
  );

  return { app, backend, rootKeyStore, getCapturedL402: () => capturedL402 };
}

/** Build a valid L402 credential from the captured macaroon + known preimage. */
function credentialFromMacaroon(macaroonB64: string, scheme: "L402" | "LSAT" = "L402"): string {
  return new L402({ macaroons: macaroonB64, paymentPreimage: PREIMAGE_HEX }).toAuthorizationHeader(
    { legacy: scheme === "LSAT" },
  );
}

function hodlCredentialFromMacaroon(
  macaroonB64: string,
  preimage = "",
  scheme: "L402" | "LSAT" = "L402",
): string {
  const token = new L402({ macaroons: macaroonB64 });
  if (preimage.length === 0) {
    return token.toPendingToken({ legacy: scheme === "LSAT" });
  }
  token.setPreimage(preimage);
  return token.toAuthorizationHeader({ legacy: scheme === "LSAT" });
}

/** Mint a macaroon with known keys (for testing caveat scenarios). */
function mintTestMacaroon(caveats: ReturnType<typeof validUntil>[] = []) {
  return mintMacaroon({
    rootKey: ROOT_KEY,
    identifier: {
      version: 0,
      paymentHash: hexToBytes(PAYMENT_HASH_HEX),
      tokenId: TOKEN_ID,
    },
    caveats,
  });
}

// --- Shared scenario suite ---

export function defineIntegrationSuite(
  title: string,
  makeApp: typeof buildIntegrationApp = buildIntegrationApp,
): void {
  describe(title, () => {
    // Scenario 1 — missing credential, default dual challenge
    test("no credential → 402 with LSAT-first/L402-second dual challenge", async () => {
      const { app } = await makeApp();
      const res = await supertest(app).get("/paid");

      expect(res.status).toBe(402);
      const wwwAuth = res.headers["www-authenticate"] as string;
      const token = L402.fromHeader(wwwAuth);
      expect(wwwAuth.indexOf("LSAT macaroon=")).toBeLessThan(wwwAuth.indexOf("L402 macaroon="));
      expect(token.macaroon).toBeTruthy();
      expect(token.invoice).toMatch(/^lnbcrt/);
    });

    // Scenario 2 — explicit L402-only challenge
    test("l402-only mode → single L402 challenge", async () => {
      const { app } = await makeApp({ challengeCompatibility: "l402-only" });
      const res = await supertest(app).get("/paid");

      expect(res.status).toBe(402);
      const wwwAuth = res.headers["www-authenticate"] as string;
      expect(L402.fromHeader(wwwAuth).macaroon).toBeTruthy();
      expect(wwwAuth).toContain("L402 macaroon=");
      expect(wwwAuth).not.toContain("LSAT macaroon=");
    });

    // Scenario 3 — paid retry: capture macaroon from 402, settle, retry → 200
    test("paid retry: capture macaroon from challenge → settle → 200", async () => {
      const { app, backend } = await makeApp();

      // Step 1: fresh 402 — backend creates invoice with PAYMENT_HASH_HEX
      const challenge = await supertest(app).get("/paid");
      expect(challenge.status).toBe(402);

      const captured = L402.fromHeader(challenge.headers["www-authenticate"] as string);
      expect(captured.macaroon).toBeTruthy();

      // Step 2: settle the invoice
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      // Step 3: retry with captured macaroon + known preimage
      const res = await supertest(app)
        .get("/paid")
        .set("Authorization", credentialFromMacaroon(captured.macaroon));
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.paymentHash).toBe(PAYMENT_HASH_HEX);
    });

    // Scenario 4 — LSAT scheme credential accepted
    test("LSAT scheme credential → 200", async () => {
      const { app, backend } = await makeApp();

      // Trigger invoice creation
      await supertest(app).get("/paid");
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      const macaroon = mintTestMacaroon();
      const lsatHeader = credentialFromMacaroon(macaroon, "LSAT");

      const res = await supertest(app).get("/paid").set("Authorization", lsatHeader);
      expect(res.status).toBe(200);
    });

    test("HODL missing credential with body paymentHash → 402 challenge", async () => {
      const { app, backend } = await makeApp({ hodl: true });

      const res = await supertest(app).post("/paid").send({ paymentHash: PAYMENT_HASH_HEX });

      expect(res.status).toBe(402);
      expect(L402.fromHeader(res.headers["www-authenticate"] as string).macaroon).toBeTruthy();
      await expect(backend.lookupInvoice(PAYMENT_HASH_HEX)).resolves.toMatchObject({
        status: "open",
        amountMsat: AMOUNT_MSAT,
      });
    });

    test("HODL held invoice with no preimage → 200", async () => {
      const { app, backend } = await makeApp({ hodl: true });

      const challenge = await supertest(app).post("/paid").send({ paymentHash: PAYMENT_HASH_HEX });
      const macaroon = L402.fromHeader(challenge.headers["www-authenticate"] as string).macaroon;
      backend.hold(PAYMENT_HASH_HEX);

      const res = await supertest(app)
        .get("/paid")
        .set("Authorization", hodlCredentialFromMacaroon(macaroon));

      expect(res.status).toBe(200);
      expect(res.body.paymentHash).toBe(PAYMENT_HASH_HEX);
      expect(backend.settleHodlInvoiceCalls).toBe(0);
    });

    test("HODL held invoice with preimage → settles once and returns 200", async () => {
      const { app, backend } = await makeApp({ hodl: true });

      const challenge = await supertest(app).post("/paid").send({ paymentHash: PAYMENT_HASH_HEX });
      const macaroon = L402.fromHeader(challenge.headers["www-authenticate"] as string).macaroon;
      backend.hold(PAYMENT_HASH_HEX);

      const res = await supertest(app)
        .get("/paid")
        .set("Authorization", hodlCredentialFromMacaroon(macaroon, PREIMAGE_HEX));

      expect(res.status).toBe(200);
      expect(backend.settleHodlInvoiceCalls).toBe(1);
      await expect(backend.lookupInvoice(PAYMENT_HASH_HEX)).resolves.toMatchObject({
        status: "settled",
      });
    });

    test("HODL settled invoice credential → 401", async () => {
      const { app, backend } = await makeApp({ hodl: true });

      const challenge = await supertest(app).post("/paid").send({ paymentHash: PAYMENT_HASH_HEX });
      const macaroon = L402.fromHeader(challenge.headers["www-authenticate"] as string).macaroon;
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      const res = await supertest(app)
        .get("/paid")
        .set("Authorization", hodlCredentialFromMacaroon(macaroon, PREIMAGE_HEX));

      expect(res.status).toBe(401);
      expect(backend.settleHodlInvoiceCalls).toBe(0);
    });

    test("non-HODL config with held invoice → 401 invalid credential", async () => {
      const { app, backend } = await makeApp();

      const challenge = await supertest(app).get("/paid");
      const macaroon = L402.fromHeader(challenge.headers["www-authenticate"] as string).macaroon;
      backend.hold(PAYMENT_HASH_HEX);

      const res = await supertest(app)
        .get("/paid")
        .set("Authorization", hodlCredentialFromMacaroon(macaroon, PREIMAGE_HEX));

      expect(res.status).toBe(401);
    });

    // Scenario 5 — invalid credential (parse failure)
    test("garbage credential → 401", async () => {
      const { app } = await makeApp();
      const res = await supertest(app).get("/paid").set("Authorization", "L402 notbase64:nothex");
      expect(res.status).toBe(401);
    });

    // Scenario 6 — invalid preimage (right length, wrong hash)
    test("wrong preimage → 401", async () => {
      const { app, backend } = await makeApp();
      await supertest(app).get("/paid");
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      const macaroon = mintTestMacaroon();
      const wrongPreimage = "ff".repeat(32);
      const authHeader = new L402({
        macaroons: macaroon,
        paymentPreimage: wrongPreimage,
      }).toAuthorizationHeader();

      const res = await supertest(app).get("/paid").set("Authorization", authHeader);
      expect(res.status).toBe(401);
    });

    // Scenario 7 — expired valid-until caveat
    test("expired valid-until caveat → 401", async () => {
      const { app, backend } = await makeApp({ satisfiers: [validUntilSatisfier()] });
      await supertest(app).get("/paid");
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      const macaroon = mintTestMacaroon([validUntil({ iso: "2020-01-01T00:00:00.000Z" })]);
      const authHeader = credentialFromMacaroon(macaroon);

      const res = await supertest(app).get("/paid").set("Authorization", authHeader);
      expect(res.status).toBe(401);
    });

    // Scenario 8 — capability mismatch at construction
    test("hodl:true on non-hodl backend throws BackendCapabilityError", async () => {
      const noHodlBackend: LightningBackend = {
        kind: "mock",
        capabilities: {
          hodl: false,
          cancelInvoice: false,
          streamingInvoices: false,
          customDescription: false,
        },
        createInvoice: async () => {
          throw new Error("not called");
        },
        lookupInvoice: async () => {
          throw new Error("not called");
        },
      };
      const rootKeyStore = new InMemoryRootKeyStore();

      expect(() =>
        boltwall({
          hodl: true,
          service: "test-service",
          backend: noHodlBackend,
          rootKeyStore,
          price: AMOUNT_MSAT,
        }),
      ).toThrow(BackendCapabilityError);
    });

    // Scenario 9 — amount mismatch (security invariant)
    test("amount mismatch: invoice 1000 msat vs price 2000 msat → 401", async () => {
      const backend = new IntegrationBackend();
      const rootKeyStore = new InMemoryRootKeyStore();
      await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

      // Pre-create the invoice at AMOUNT_MSAT (1000) BEFORE boltwall can overwrite it.
      // boltwall will look up this invoice by PAYMENT_HASH_HEX; the amount mismatch
      // (1000 msat actual vs 2000 msat expected) must trigger a 401.
      await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
      backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

      const app = express();
      app.use(
        "/paid",
        boltwall({
          service: "test-service",
          backend,
          rootKeyStore,
          price: 2_000n,
          allowInsecureHttp: true,
        }),
        (_req, res) => res.json({ ok: true }),
      );

      // Send credential directly — no 402 step so the pre-stored 1000 msat invoice is preserved.
      const macaroon = mintTestMacaroon();
      const authHeader = credentialFromMacaroon(macaroon);

      const res = await supertest(app).get("/paid").set("Authorization", authHeader);
      expect(res.status).toBe(401);
    });
  });
}
