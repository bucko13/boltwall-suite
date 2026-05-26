# Migration from legacy boltwall

This document covers the migration path from the legacy AGPL-3.0
[`bucko13/boltwall`](https://github.com/bucko13/boltwall) middleware to
`@boltwall/middleware/express`.

**AGPL note:** Legacy `boltwall` is AGPL-3.0; this rewrite is MIT. No AGPL
source is copied here. If you forked legacy `boltwall`, your fork is still
AGPL — do not merge it into a project that uses `@boltwall/middleware` without
legal review. The compatibility behavior described below is re-implemented from
the L402 specs, the MIT `lsat-js` compatibility audit, and product behavior
documented in the old `boltwall` README.

---

## Overview

| Legacy | New |
|--------|-----|
| `boltwall(config, logger)` | `boltwall(options)` from `@boltwall/middleware/express` |
| Composed chain: `parseEnv → node → invoice → token → validateLsat → paywall → errorHandler` | Single middleware function; no internal chain |
| Env-var-first config (`LND_SOCKET`, `LND_MACAROON`, …) | Explicit adapter construction; optional `loadBackendFromEnv()` helper |
| AGPL-3.0 | MIT |

---

## Config rename map

| Legacy key | New key / approach | Notes |
|---|---|---|
| `getCaveats` | `caveats: [...]` | Accepts `Caveat` objects, factory functions (`validUntil`, `originCaveat`, `routeCaveat`), or per-request resolvers `(req) => Caveat` |
| `caveatSatisfiers` | `satisfiers: [...]` | Pass spec-compliant satisfiers from `@boltwall/l402` (e.g. `validUntilSatisfier()`, `originSatisfier(...)`) |
| `getInvoiceDescription` | `invoiceMemo: (req) => string` | Same shape, renamed for clarity |
| `minAmount` + `rate` | `price: bigint \| (req) => bigint` | Millisatoshis; use `sats(n)` helper if available, or `BigInt(n) * 1000n` |
| `hodl` | `hodl?: true` in options | Triggers synchronous capability check at construction; see below |
| `oauth` | **Removed at v1** | Out-of-scope; open a feature request if needed |
| `masterRoute` + `allowSubroutes` | Use Express mounting | `app.use("/paid", boltwall(...))` is the idiomatic path |
| `LND_SOCKET`, `LND_MACAROON`, `LND_TLS_CERT` env vars | `new LndAdapter({ socket, macaroon, cert })` or `loadBackendFromEnv()` | Explicit is recommended; env helper available for transition |

---

## Capability-flag gotchas

**Legacy behaviour:** `hodl: true` was accepted silently with any backend.
Misconfiguration failed at the first paid request (runtime error).

**New behaviour:** `hodl: true` throws `BackendCapabilityError` **synchronously
at construction** if the backend's `capabilities.hodl` flag is `false`. This
applies to other flags too: `cancelInvoice`, `streamingInvoices`,
`customDescription`.

```ts
import { boltwall } from "@boltwall/middleware/express";
import { LndAdapter } from "@boltwall/adapters/lnd";

// Throws immediately if LND adapter does not support HODL invoices:
const mw = boltwall({ hodl: true, backend: new LndAdapter(...), ... });
```

**Migration action:** Add the capability flags you rely on to `boltwall()`
options so misconfigurations surface at server start, not during payment.

## HODL invoices

HODL invoices are first-class Boltwall behavior. In HODL mode the client
generates a preimage and sends the corresponding 32-byte hex `paymentHash` when
requesting the initial challenge:

```ts
app.post(
  "/paid",
  express.json(),
  boltwall({
    hodl: true,
    service: "my-api",
    backend,
    rootKeyStore,
    price: 100_000n,
  }),
);
```

The first request returns a normal 402 challenge, but the backend invoice is a
HODL invoice bound to the supplied `paymentHash`. After the payer's HTLC is
accepted, the invoice is `held`; at that point `Authorization: L402 <macaroon>:`
or `Authorization: LSAT <macaroon>:` is enough to authorize access. If the
client also sends the preimage, Boltwall calls `settleHodlInvoice(preimage)`
once and then authorizes the request. After settlement, the same HODL
credential is expired and returns 401.

Standard L402 credentials still require `macaroon:preimage` as described by
L402 protocol-specification.md §5.2/§5.3. The empty-preimage HODL credential is
only accepted when `hodl: true` is configured and the backend reports the
invoice as `held`.

---

## Caveat semantics changes

### Expiration caveat

| | Legacy | New |
|---|---|---|
| Condition | `expiration` | `valid-until` |
| Value format | Unix milliseconds (`1577228778197`) | ISO-8601 string (`2030-01-01T00:00:00.000Z`) |
| Factory | `(none — set manually)` | `validUntil({ seconds: 3600 })` / `validUntil({ iso: "..." })` / `validUntil({ date: new Date() })` |
| Satisfier | custom | `validUntilSatisfier()` from `@boltwall/l402` |

Legacy credentials using `expiration=<unix-ms>` can still be verified during
migration via the deprecated helpers:

```ts
import { expirationCaveat, expirationSatisfier } from "@boltwall/l402";
```

New code should use `validUntil` exclusively. The legacy helpers exist only for
validating existing LSAT-style macaroons until callers migrate.

---

## Migration recipe

### 1. Update package.json

```bash
# Remove legacy
npm uninstall boltwall

# Add new
npm install @boltwall/middleware @boltwall/adapters @boltwall/l402
```

Or with bun:

```bash
bun remove boltwall
bun add @boltwall/middleware @boltwall/adapters @boltwall/l402
```

### 2. Replace the import

```ts
// Before
import boltwall from "boltwall";

// After
import { boltwall } from "@boltwall/middleware/express";
```

### 3. Convert config

```ts
// Before
const app = express();
app.use(boltwall({
  minAmount: 100,
  getCaveats: () => [{ condition: "expiration", value: String(Date.now() + 3_600_000) }],
  caveatSatisfiers: [myExpirationSatisfier],
  getInvoiceDescription: () => "My API",
  hodl: false,
}));

// After — explicit adapter, typed config
import { LndAdapter } from "@boltwall/adapters/lnd";
import { validUntil, validUntilSatisfier } from "@boltwall/l402";

const backend = new LndAdapter({ socket: process.env.LND_SOCKET!, macaroon: process.env.LND_MACAROON! });

app.use(boltwall({
  service: "my-api",
  backend,
  rootKeyStore: new InMemoryRootKeyStore(),   // or a persistent store
  price: 100_000n,                             // 100 sats in millisatoshis
  caveats: [validUntil({ seconds: 3600 })],
  satisfiers: [validUntilSatisfier()],
  invoiceMemo: () => "My API",
}));
```

### 4. Replace expiration caveats

```ts
// Legacy
{ condition: "expiration", value: String(Date.now() + 3_600_000) }

// New
import { validUntil } from "@boltwall/l402";
validUntil({ seconds: 3600 })
```

And register the satisfier:

```ts
satisfiers: [validUntilSatisfier()]
```

### 5. Verify with the integration suite

```bash
bun run test --filter @boltwall/middleware
```

All 9 integration scenarios — including amount mismatch and expired caveats —
must pass before cutting a release.

---

## Using `loadBackendFromEnv()` (transition helper)

If you want to keep reading from env vars temporarily:

```ts
import { loadBackendFromEnv } from "@boltwall/adapters";

const backend = loadBackendFromEnv(); // reads LND_SOCKET, LND_MACAROON, LND_TLS_CERT
app.use(boltwall({ service: "my-api", backend, ... }));
```

This helper is a convenience shim — explicitly constructing `new LndAdapter({...})`
is the long-term recommendation.

---

## What was removed at v1

| Feature | Status | Path forward |
|---|---|---|
| `oauth` integration | Removed | Open a feature request; out of v1 scope |
| `masterRoute` / `allowSubroutes` config | Removed | Use Express mounting: `app.use("/path", boltwall(...))` |
| Env-var-first config (auto-loaded from process.env) | Removed from core | Use `loadBackendFromEnv()` or explicit adapter construction |
| Free-form `expiration=<ms>` caveat (minting) | Deprecated (compatibility helpers are exported from `@boltwall/l402`) | Migrate to `valid-until=<ISO>` + `validUntil()` factory |
