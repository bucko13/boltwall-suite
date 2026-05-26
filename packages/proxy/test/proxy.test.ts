import { afterEach, describe, expect, test } from "bun:test";
import type { Server } from "node:http";

import type { CreatedInvoice, CreateInvoiceRequest } from "@boltwall/adapters";
import { MockAdapter } from "@boltwall/adapters/testing";
import type { L402Config, MinimalLogger } from "@boltwall/middleware/core";
import express from "express";

import { createProxy } from "../src/index";

const PREIMAGE_HEX = "00".repeat(32);
const PAYMENT_HASH_HEX = "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";
const AMOUNT_MSAT = 1_000n;

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => close(server)));
});

class FixedInvoiceBackend extends MockAdapter {
  lastCreateInvoice: CreateInvoiceRequest | undefined;

  override async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    this.lastCreateInvoice = request;
    const result = await super.createInvoice({ ...request, paymentHash: PAYMENT_HASH_HEX });
    return { ...result, paymentRequest: `lnbcrt${result.amountMsat}n1${result.paymentHash}` };
  }
}

class MemoryRootKeyStore implements L402Config["rootKeyStore"] {
  readonly #keys = new Map<string, Uint8Array>();

  async get(tokenId: Uint8Array): Promise<Uint8Array | null> {
    const key = this.#keys.get(bytesToHex(tokenId));
    return key === undefined ? null : new Uint8Array(key);
  }

  async put(tokenId: Uint8Array, rootKey: Uint8Array): Promise<void> {
    this.#keys.set(bytesToHex(tokenId), new Uint8Array(rootKey));
  }

  async delete(tokenId: Uint8Array): Promise<void> {
    this.#keys.delete(bytesToHex(tokenId));
  }
}

function captureLogger(): MinimalLogger & { warnings: object[] } {
  const warnings: object[] = [];
  return {
    warnings,
    info: () => {},
    warn: (obj) => {
      warnings.push(obj);
    },
    error: () => {},
  };
}

async function listen(app: express.Express): Promise<{ url: string; server: Server }> {
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("unexpected-listen-address");
  }
  return { url: `http://127.0.0.1:${address.port}`, server };
}

async function buildUpstream() {
  const app = express();
  app.use(express.json());
  app.all("/public", (req, res) => {
    res.json({ path: req.path, authorization: req.get("authorization") ?? null });
  });
  app.all("/paid", (req, res) => {
    res.json({
      ok: true,
      path: req.path,
      method: req.method,
      custom: req.get("x-custom-foo") ?? null,
      cookie: req.get("cookie") ?? null,
      authorization: req.get("authorization") ?? null,
    });
  });
  app.get("/slow", (_req, res) => {
    setTimeout(() => res.json({ ok: true }), 100);
  });
  return listen(app);
}

function buildProxy(targetUrl: string, overrides: Partial<Parameters<typeof createProxy>[0]> = {}) {
  const backend = new FixedInvoiceBackend();
  const logger = captureLogger();
  const app = createProxy({
    targetUrl,
    backend,
    rootKeyStore: new MemoryRootKeyStore(),
    defaultPrice: AMOUNT_MSAT,
    unprotectedPaths: ["/public"],
    logger,
    ...overrides,
  });

  return { app, backend, logger };
}

describe("createProxy", () => {
  test("unprotected paths pass through without L402", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url);
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/public`, {
      headers: { authorization: "Bearer existing" },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ path: "/public", authorization: "Bearer existing" });
  });

  test("missing credential returns default dual LSAT-first/L402-second challenge", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url);
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`);
    const challenge = res.headers.get("www-authenticate") ?? "";

    expect(res.status).toBe(402);
    expect(challenge).toContain("LSAT macaroon=");
    expect(challenge).toContain("L402 macaroon=");
    expect(challenge.indexOf("LSAT")).toBeLessThan(challenge.indexOf("L402"));
  });

  test("l402-only challenge mode emits only L402", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url, { challengeCompatibility: "l402-only" });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`);
    const challenge = res.headers.get("www-authenticate") ?? "";

    expect(res.status).toBe(402);
    expect(challenge).toContain("L402 macaroon=");
    expect(challenge).not.toContain("LSAT macaroon=");
  });

  test("valid paid credential proxies to upstream with sanitized headers", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      routes: [{ path: "/paid", methods: ["GET"], price: AMOUNT_MSAT }],
      forwardHeaders: { allow: ["x-custom-*"] },
    });
    const proxy = await listen(app);

    const challenge = await fetch(`${proxy.url}/paid`);
    const macaroon = extractMacaroon(challenge.headers.get("www-authenticate") ?? "");
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    const res = await fetch(`${proxy.url}/paid`, {
      headers: {
        authorization: `L402 ${macaroon}:${PREIMAGE_HEX}`,
        cookie: "sid=secret",
        "x-custom-foo": "forward-me",
        "x-other": "drop-me",
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      path: "/paid",
      custom: "forward-me",
      cookie: null,
      authorization: null,
    });
  });

  test("configured CORS exposes L402 challenge headers on 402 responses", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url, {
      cors: { allowOrigins: ["https://playground.example"] },
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`, {
      headers: { origin: "https://playground.example" },
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://playground.example");
    expect(res.headers.get("access-control-expose-headers")).toBe("WWW-Authenticate");
    expect(res.headers.get("www-authenticate")).toContain("L402 macaroon=");
  });

  test("configured CORS is present on paid retry responses", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      routes: [{ path: "/paid", methods: ["GET"], price: AMOUNT_MSAT }],
      cors: { allowOrigins: ["https://playground.example"] },
    });
    const proxy = await listen(app);

    const challenge = await fetch(`${proxy.url}/paid`, {
      headers: { origin: "https://playground.example" },
    });
    const macaroon = extractMacaroon(challenge.headers.get("www-authenticate") ?? "");
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    const res = await fetch(`${proxy.url}/paid`, {
      headers: {
        origin: "https://playground.example",
        authorization: `L402 ${macaroon}:${PREIMAGE_HEX}`,
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://playground.example");
    expect(await res.json()).toMatchObject({ ok: true, path: "/paid" });
  });

  test("configured CORS answers preflight without creating an invoice", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      cors: {
        allowOrigins: ["https://playground.example"],
        allowHeaders: ["Authorization"],
        allowMethods: ["GET", "OPTIONS"],
        maxAgeSeconds: 600,
      },
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`, {
      method: "OPTIONS",
      headers: {
        origin: "https://playground.example",
        "access-control-request-method": "GET",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://playground.example");
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Authorization");
    expect(res.headers.get("access-control-max-age")).toBe("600");
    expect(backend.lastCreateInvoice).toBeUndefined();
  });

  test("configured CORS does not allow unlisted origins", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url, {
      cors: { allowOrigins: ["https://playground.example"] },
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`, {
      headers: { origin: "https://evil.example" },
    });

    expect(res.status).toBe(402);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-expose-headers")).toBeNull();
  });

  test("legacy LSAT credential proxies through the same paid path", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      routes: [{ path: "/paid", methods: ["GET"], price: AMOUNT_MSAT }],
    });
    const proxy = await listen(app);

    const challenge = await fetch(`${proxy.url}/paid`);
    const macaroon = extractMacaroon(challenge.headers.get("www-authenticate") ?? "");
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    const res = await fetch(`${proxy.url}/paid`, {
      headers: { authorization: `LSAT ${macaroon}:${PREIMAGE_HEX}` },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, path: "/paid" });
  });

  test("default price gates paths without a matching route", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url, {
      routes: [{ path: "/other", price: 2_000n }],
      defaultPrice: AMOUNT_MSAT,
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`);

    expect(res.status).toBe(402);
  });

  test("passes dynamic pricing and invoice memo through to the L402 middleware", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      routes: [
        {
          path: "/paid",
          price: (req) => (req.get("x-tier") === "pro" ? 5_000n : 2_000n),
        },
      ],
      invoiceMemo: (req) => `proxy ${req.path}`,
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`, { headers: { "x-tier": "pro" } });

    expect(res.status).toBe(402);
    expect(backend.lastCreateInvoice).toMatchObject({
      amountMsat: 5_000n,
      description: "proxy /paid",
    });
  });

  test("returns 404 when no route matches and no default price is configured", async () => {
    const upstream = await buildUpstream();
    const { app } = buildProxy(upstream.url, {
      routes: [{ path: "/other", price: 2_000n }],
      defaultPrice: undefined,
    });
    const proxy = await listen(app);

    const res = await fetch(`${proxy.url}/paid`);

    expect(res.status).toBe(404);
  });

  test("upstream timeout returns a redacted 502", async () => {
    const upstream = await buildUpstream();
    const { app, backend } = buildProxy(upstream.url, {
      routes: [{ path: "/slow", price: AMOUNT_MSAT }],
      upstreamTimeoutMs: 20,
    });
    const proxy = await listen(app);

    const challenge = await fetch(`${proxy.url}/slow`);
    const macaroon = extractMacaroon(challenge.headers.get("www-authenticate") ?? "");
    backend.settle(PAYMENT_HASH_HEX, PREIMAGE_HEX);

    const res = await fetch(`${proxy.url}/slow`, {
      headers: { authorization: `L402 ${macaroon}:${PREIMAGE_HEX}` },
    });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_unavailable" });
  });

  test("logs a warning for non-TLS upstream targets", async () => {
    const upstream = await buildUpstream();
    const { logger } = buildProxy(upstream.url);

    expect(logger.warnings).toContainEqual({ target: new URL(upstream.url).origin });
  });
});

function extractMacaroon(header: string): string {
  const match = /(?:L402|LSAT) macaroon="([^"]+)"/.exec(header);
  if (match === null) throw new Error(`missing macaroon in ${header}`);
  return match[1]!;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      const maybeNodeError = error as (Error & { code?: string }) | undefined;
      if (maybeNodeError?.code === "ERR_SERVER_NOT_RUNNING") {
        resolve();
        return;
      }
      if (maybeNodeError) {
        reject(error);
        return;
      }
      resolve();
    });
    server.closeAllConnections();
  });
}
