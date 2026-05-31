# @boltwall/middleware

Node-focused L402 middleware for Boltwall Suite.

New to L402? See the [project README](../../README.md#what-is-l402) for what L402 is and how the packages fit together.

## Installation

```sh
bun add @boltwall/middleware @boltwall/adapters @boltwall/l402
```

## Entrypoints

| Import path                    | What it exports                                       |
| ------------------------------ | ----------------------------------------------------- |
| `@boltwall/middleware`         | Web Fetch authorization core (`authorizeL402`, types) |
| `@boltwall/middleware/core`    | Same as root                                          |
| `@boltwall/middleware/express` | Express 4/5 adapter (`boltwall`, caveat factories)    |

## Quick start (Express)

```ts
import express from "express";
import { boltwall, validUntil } from "@boltwall/middleware/express";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { InMemoryRootKeyStore, validUntilSatisfier } from "@boltwall/l402";

const app = express();

app.set("trust proxy", 1); // required when TLS terminates before Express

app.use(
  "/paid",
  boltwall({
    service: "my-api",
    backend: new LndAdapter({
      socket: process.env.LND_SOCKET!,
      cert: process.env.LND_TLS_CERT!,
      macaroon: process.env.LND_MACAROON!,
    }),
    rootKeyStore: new InMemoryRootKeyStore(), // non-persistent; use DB in production
    price: 100_000n, // 100 sats in millisatoshis
    caveats: [validUntil({ seconds: 3600 })],
    satisfiers: [validUntilSatisfier()],
  }),
  (req, res) => {
    res.json({ ok: true, paymentHash: req.l402?.paymentHash });
  },
);
```

L402 credentials are bearer credentials. Production deployments must use HTTPS
(`L402 protocol-specification.md §9.1`). If Express runs behind a TLS
terminating proxy, configure `trust proxy` and forward `X-Forwarded-Proto:
https`. Cleartext loopback requests (`localhost`, `127.0.0.1`, `::1`) are
accepted for local development. Set `allowInsecureHttp: true` only in tests; it is rejected on non-loopback addresses.

### Try it without a Lightning node

The snippet above needs a real LND backend. To exercise the full
challenge → pay → retry flow without one:

- **In-process (no node):** `test/readme/express-quickstart.test.ts` mirrors this
  quick start against `MockAdapter` and asserts the 402 challenge and 401 paths.
  Run it with `bun test` from `packages/middleware`.
- **Real Lightning (full pay/retry):** the
  [local regtest runbook](../../docs/local-regtest-proxy-playground.md) starts a
  two-node LND topology, pays the invoice, and retries with the credential.

## Caveat factories

Imported from `@boltwall/middleware/express` (re-exported from [`@boltwall/l402`](../l402/README.md)):

| Factory                   | Condition           | Example                                       |
| ------------------------- | ------------------- | --------------------------------------------- |
| `validUntil({ seconds })` | `valid-until=<ISO>` | `validUntil({ seconds: 3600 })`               |
| `validUntil({ iso })`     | `valid-until=<ISO>` | `validUntil({ iso: "2030-01-01T00:00:00Z" })` |
| `originCaveat(origins)`   | `origin=<csv>`      | `originCaveat("https://example.com")`         |
| `routeCaveat(patterns)`   | `route=<csv>`       | `routeCaveat(["/api/*", "/v1/*"])`            |

## Backend capability checking

`boltwall()` calls `assertBackendSupports()` at construction time. If you pass
`hodl: true` with a backend that has `capabilities.hodl === false`, it throws
`BackendCapabilityError` immediately — fail fast, not at the first payment.

## Web Fetch core (Next.js, Hono, Cloudflare Workers)

The root entrypoint exports `authorizeL402` which operates on the standard Web
Fetch `Request` / `Response` API. No Express adapter needed — use it directly
in any framework that speaks Web Fetch.

### Next.js Route Handler (App Router)

```ts
// app/api/paid/route.ts
import { authorizeL402 } from "@boltwall/middleware";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { InMemoryRootKeyStore } from "@boltwall/l402";

// Create these once (e.g. in lib/boltwall.ts) and import as singletons.
// InMemoryRootKeyStore is non-persistent — use a database-backed store in production.
const backend = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  cert: process.env.LND_TLS_CERT!,
  macaroon: process.env.LND_MACAROON!,
});
const rootKeyStore = new InMemoryRootKeyStore();

const config = {
  service: "my-api",
  backend,
  rootKeyStore,
  price: 100_000n,
};

export async function GET(request: Request) {
  const result = await authorizeL402(request, config);
  if (!result.ok) {
    return result.response;
  }
  return Response.json({ paid: true, paymentHash: result.context.paymentHash });
}
```

### Hono

```ts
import { Hono } from "hono";
import { authorizeL402 } from "@boltwall/middleware";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { InMemoryRootKeyStore } from "@boltwall/l402";

// Create these once (e.g. in boltwall.ts) and import as singletons.
// InMemoryRootKeyStore is non-persistent — use a database-backed store in production.
const backend = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  cert: process.env.LND_TLS_CERT!,
  macaroon: process.env.LND_MACAROON!,
});
const rootKeyStore = new InMemoryRootKeyStore();

const app = new Hono();

const config = { service: "my-api", backend, rootKeyStore, price: 100_000n };

app.use("/paid/*", async (c, next) => {
  const result = await authorizeL402(c.req.raw, config);
  if (!result.ok) {
    result.response.headers.forEach((value, key) => c.header(key, value));
    return c.body(null, result.response.status as 402 | 401 | 502);
  }
  c.set("l402", result.context);
  await next();
});

app.get("/paid/data", (c) => {
  const l402 = c.get("l402");
  return c.json({ paid: true, paymentHash: l402.paymentHash });
});
```

## Migrating from legacy `boltwall`

See [docs/migration-from-boltwall.md](../../docs/migration-from-boltwall.md).

## Notes

- `express` is a peer dependency so core-only consumers do not pull it transitively.
- `pino` is used only by the optional structured logger import path; the core no-op logger path does not import it.
- [`@boltwall/adapters`](../adapters/README.md) is a runtime dependency for capability checking.
