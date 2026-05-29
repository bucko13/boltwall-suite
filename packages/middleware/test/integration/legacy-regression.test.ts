import { describe, expect, test } from "bun:test";
import { MockAdapter } from "@boltwall/adapters/testing";
import {
  InMemoryRootKeyStore,
  buildAuthorizationHeader,
  expirationCaveat,
  expirationSatisfier,
  ipCaveat,
  ipSatisfier,
  mintMacaroon,
  routeCaveat,
  routeSatisfier,
  validUntil,
  validUntilSatisfier,
} from "@boltwall/l402";
import { specPreimageFixtures } from "@boltwall/test-fixtures";
import express from "express";
import supertest from "supertest";

import { boltwall } from "../../src/express/index.js";

const fixture = specPreimageFixtures.find((f) => f.name === "zero-preimage-canonical")!;
const PREIMAGE_HEX = fixture.preimageHex;
const PAYMENT_HASH_HEX = fixture.paymentHashHex;
const AMOUNT_MSAT = 1_000n;
const ROOT_KEY = hexToBytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const TOKEN_ID = new Uint8Array(32).fill(0x42);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function mintCredential(caveats: Parameters<typeof mintMacaroon>[0]["caveats"] = []) {
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

function legacyCredential(caveats: Parameters<typeof mintMacaroon>[0]["caveats"] = []): string {
  const macaroon = mintCredential(caveats);
  return buildAuthorizationHeader({ macaroons: macaroon, preimage: PREIMAGE_HEX }).replace(
    /^L402 /,
    "LSAT ",
  );
}

function l402Credential(caveats: Parameters<typeof mintMacaroon>[0]["caveats"] = []): string {
  const macaroon = mintCredential(caveats);
  return buildAuthorizationHeader({ macaroons: macaroon, preimage: PREIMAGE_HEX });
}

async function buildLegacyRegressionApp(satisfiers: Parameters<typeof boltwall>[0]["satisfiers"]) {
  const backend = new MockAdapter();
  await backend.createInvoice({ amountMsat: AMOUNT_MSAT, paymentHash: PAYMENT_HASH_HEX });
  backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

  const rootKeyStore = new InMemoryRootKeyStore();
  await rootKeyStore.put(TOKEN_ID, ROOT_KEY);

  const app = express();
  app.use(
    boltwall({
      service: "legacy-regression",
      backend,
      rootKeyStore,
      price: AMOUNT_MSAT,
      satisfiers,
    }),
  );
  app.get("/api/v1", (_req, res) => {
    res.json({ ok: true, route: "/api/v1" });
  });
  app.get("/api/v2", (_req, res) => {
    res.json({ ok: true, route: "/api/v2" });
  });

  return app;
}

describe("legacy LSAT regression suite", () => {
  test("legacy expiration caveat in the future is accepted with expirationSatisfier", async () => {
    const app = await buildLegacyRegressionApp([expirationSatisfier()]);
    const auth = legacyCredential([expirationCaveat(4_102_444_800_000)]);

    const res = await supertest(app).get("/api/v1").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, route: "/api/v1" });
  });

  test("legacy expiration caveat in the past is rejected as expired", async () => {
    const app = await buildLegacyRegressionApp([expirationSatisfier()]);
    const auth = legacyCredential([expirationCaveat(1_577_228_778_197)]);

    const res = await supertest(app).get("/api/v1").set("Authorization", auth);

    expect(res.status).toBe(401);
  });

  test("legacy ip caveat accepts matching client IP from request context", async () => {
    const app = await buildLegacyRegressionApp([ipSatisfier()]);
    const auth = legacyCredential([ipCaveat("1.2.3.4")]);

    const res = await supertest(app)
      .get("/api/v1")
      .set("Authorization", auth)
      .set("X-Forwarded-For", "1.2.3.4");

    expect(res.status).toBe(200);
  });

  test("legacy ip caveat rejects mismatched client IP", async () => {
    const app = await buildLegacyRegressionApp([ipSatisfier()]);
    const auth = legacyCredential([ipCaveat("1.2.3.4")]);

    const res = await supertest(app)
      .get("/api/v1")
      .set("Authorization", auth)
      .set("X-Forwarded-For", "5.6.7.8");

    expect(res.status).toBe(401);
  });

  test("legacy route caveat accepts the matching request path", async () => {
    const app = await buildLegacyRegressionApp([routeSatisfier(["/api/v1"])]);
    const auth = legacyCredential([routeCaveat("/api/v1")]);

    const res = await supertest(app).get("/api/v1").set("Authorization", auth);

    expect(res.status).toBe(200);
  });

  test("legacy expiration and modern valid-until are additive in one verifier", async () => {
    const app = await buildLegacyRegressionApp([expirationSatisfier(), validUntilSatisfier()]);
    const auth = legacyCredential([
      expirationCaveat(4_102_444_800_000),
      validUntil({ iso: "2100-01-01T00:00:00.000Z" }),
    ]);

    const res = await supertest(app).get("/api/v1").set("Authorization", auth);

    expect(res.status).toBe(200);
  });

  test("new L402 valid-until credential still passes on the same middleware shape", async () => {
    const app = await buildLegacyRegressionApp([expirationSatisfier(), validUntilSatisfier()]);
    const auth = l402Credential([validUntil({ iso: "2100-01-01T00:00:00.000Z" })]);

    const res = await supertest(app).get("/api/v1").set("Authorization", auth);

    expect(res.status).toBe(200);
  });
});
