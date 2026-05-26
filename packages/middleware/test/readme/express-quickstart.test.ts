/**
 * README quick-start mirror test.
 *
 * This file mirrors the Express quick-start example in packages/middleware/README.md
 * exactly (minus app.listen). If this test fails, the README example is broken.
 */
import { describe, expect, test } from "bun:test";
import express from "express";
import supertest from "supertest";

import { boltwall, validUntil } from "../../src/express/index.js";
import { MockAdapter } from "@boltwall/adapters/testing";
import { InMemoryRootKeyStore } from "@boltwall/l402";

// --- Mirror of README quick-start example ---

const app = express();

app.use(
  "/paid",
  boltwall({
    service: "example-api",
    backend: new MockAdapter(),
    rootKeyStore: new InMemoryRootKeyStore(),
    price: 100_000n, // 100 sats in millisatoshis
    caveats: [validUntil({ seconds: 3600 })],
  }),
);

app.get("/paid/data", (req: express.Request, res: express.Response) => {
  res.json({ paid: true, paymentHash: req.l402?.paymentHash });
});

// --- Tests ---

describe("README quick-start: protect an Express route with L402", () => {
  test("unauthenticated request → 402 with WWW-Authenticate", async () => {
    const res = await supertest(app).get("/paid/data");
    expect(res.status).toBe(402);
    expect(res.headers["www-authenticate"]).toBeTruthy();
  });

  test("invalid credential → 401", async () => {
    const res = await supertest(app).get("/paid/data").set("Authorization", "L402 bad:cred");
    expect(res.status).toBe(401);
  });
});
