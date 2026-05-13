# @boltwall/middleware

Node-focused L402 middleware for Boltwall Suite.

## Entrypoints

| Import path | What it exports |
|---|---|
| `@boltwall/middleware` | Web Fetch authorization core (`authorizeL402`, types) |
| `@boltwall/middleware/core` | Same as root |
| `@boltwall/middleware/express` | Express 4/5 adapter (`boltwall`, caveat factories) |

## Quick start (Express)

```ts
import express from "express";
import { boltwall, validUntil } from "@boltwall/middleware/express";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { InMemoryRootKeyStore, validUntilSatisfier } from "@boltwall/l402";

const app = express();

app.use(
  "/paid",
  boltwall({
    service: "my-api",
    backend: new LndAdapter({ socket: process.env.LND_SOCKET!, macaroon: process.env.LND_MACAROON! }),
    rootKeyStore: new InMemoryRootKeyStore(),
    price: 100_000n,                          // 100 sats in millisatoshis
    caveats: [validUntil({ seconds: 3600 })],
    satisfiers: [validUntilSatisfier()],
  }),
  (req, res) => {
    res.json({ ok: true, paymentHash: req.l402?.paymentHash });
  },
);
```

## Caveat factories

Imported from `@boltwall/middleware/express` (re-exported from `@boltwall/l402`):

| Factory | Condition | Example |
|---|---|---|
| `validUntil({ seconds })` | `valid-until=<ISO>` | `validUntil({ seconds: 3600 })` |
| `validUntil({ iso })` | `valid-until=<ISO>` | `validUntil({ iso: "2030-01-01T00:00:00Z" })` |
| `originCaveat(origins)` | `origin=<csv>` | `originCaveat("https://example.com")` |
| `routeCaveat(patterns)` | `route=<csv>` | `routeCaveat(["/api/*", "/v1/*"])` |

## Backend capability checking

`boltwall()` calls `assertBackendSupports()` at construction time. If you pass
`hodl: true` with a backend that has `capabilities.hodl === false`, it throws
`BackendCapabilityError` immediately — fail fast, not at the first payment.

## Web Fetch core (Next.js, Hono, Cloudflare Workers)

The root entrypoint exports `authorizeL402` which operates on the standard Web
Fetch `Request` / `Response` API. No Express adapter needed — use it directly
in any framework that speaks Web Fetch.

> These are usage snippets, not first-class adapter packages. Framework-specific
> adapters (Hono middleware, Next.js helper) may land in later phases if demand
> warrants a dedicated package.

### Next.js Route Handler (App Router)

```ts
// app/api/paid/route.ts
import { authorizeL402 } from "@boltwall/middleware";
import { backend, rootKeyStore } from "@/lib/boltwall"; // your singleton setup

const config = {
  service: "my-api",
  backend,
  rootKeyStore,
  price: 100_000n,
};

export async function GET(request: Request) {
  const result = await authorizeL402(request, config);
  if (!result.ok) {
    // Copy the 402/401/502 response from the gate result
    return result.response;
  }
  return Response.json({ paid: true, paymentHash: result.context.paymentHash });
}
```

### Hono

```ts
import { Hono } from "hono";
import { authorizeL402 } from "@boltwall/middleware";
import { backend, rootKeyStore } from "./boltwall"; // your singleton setup

const app = new Hono();

const config = { service: "my-api", backend, rootKeyStore, price: 100_000n };

app.use("/paid/*", async (c, next) => {
  const result = await authorizeL402(c.req.raw, config);
  if (!result.ok) {
    // Copy headers from the gate response
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
- `pino` is a runtime dependency; structured logging with credential redaction is built in.
- `@boltwall/adapters` is a runtime dependency for capability checking.
