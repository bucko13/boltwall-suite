# Boltwall Express Server Example

A minimal Express server protected by L402 payment authentication using
[`@boltwall/middleware`](../../packages/middleware/README.md) with `MockAdapter` (no real Lightning node required).

## What it does

- Exposes `GET /paid/data` behind an L402 payment gate.
- Issues a 402 challenge with a `WWW-Authenticate` header when no credential is present.
- Returns `{ message, paymentHash }` after a valid credential is presented.
- Uses `MockAdapter` so payments can be simulated without a real Lightning node.

## Run it

```bash
cd examples/express-server
bun install
bun run dev
```

The server listens on `http://localhost:3000`.

## Walk through the flow

### Step 1 — Request without credentials

```bash
curl -i http://localhost:3000/paid/data
```

Expected response:

```
HTTP/1.1 402 Payment Required
WWW-Authenticate: LSAT macaroon="...", invoice="lnbcrt..."
WWW-Authenticate: L402 macaroon="...", invoice="lnbcrt..."
```

### Step 2 — Capture the challenge

Parse the `WWW-Authenticate` header to extract:
- `macaroon` — a base64-encoded L402 macaroon
- `invoice` — a BOLT 11 payment request (mock format here)

```bash
WWW_AUTH=$(curl -si http://localhost:3000/paid/data | grep -i www-authenticate | head -1)
MACAROON=$(echo "$WWW_AUTH" | grep -oP 'macaroon="\K[^"]+')
```

### Step 3 — Pay the invoice (concept)

To pass the gate, a credential must carry a preimage whose SHA-256 hash equals
the invoice's payment hash, and the backend must report that invoice as settled.
With a real Lightning wallet you get both for free: you pay the BOLT 11 invoice,
the wallet hands you the preimage, and your LND node marks the invoice settled.

`MockAdapter` does not move money, so there is no wire-level "pay" step you can
curl against this server: its `settle(paymentHash, preimage)` helper must be
called on the *same in-process backend instance* the server holds, with a
matching preimage/hash pair. Driving that requires code, not curl — so Step 4
below cannot be completed against the mock-backed server as written.

For paths you can actually run end to end:

- **In-process (no node):** `packages/middleware/test/express.test.ts` builds a
  real Express app, seeds an invoice with `createInvoice(...)`, settles it with
  `backend.settle(paymentHash, preimage)` using a known preimage fixture, and
  asserts the retried request succeeds. Run it with `bun test` from
  `packages/middleware`.
- **Real Lightning (full pay/retry):** the
  [local regtest workflow](../../docs/local-regtest-proxy-playground.md) starts
  a two-node LND topology, pays the invoice from a second node, and retries with
  the resulting credential.

### Step 4 — Retry with credential (real backend)

Once the invoice is settled and you hold its preimage, the protected endpoint
returns the data:

```bash
curl -H "Authorization: L402 $MACAROON:<preimage-hex>" \
     http://localhost:3000/paid/data
```

Expected response:

```json
{
  "message": "You paid! Here is the protected data.",
  "paymentHash": "..."
}
```

## For a real Lightning node

Replace `MockAdapter` with `LndAdapter` from [`@boltwall/adapters/lnd`](../../packages/adapters/README.md):

```ts
import { LndAdapter } from "@boltwall/adapters/lnd";

const backend = new LndAdapter({
  socket: process.env.LND_SOCKET!,   // e.g. "127.0.0.1:10009"
  macaroon: process.env.LND_MACAROON!, // hex-encoded admin macaroon
  cert: process.env.LND_TLS_CERT,     // optional base64 TLS cert
});
```

See [docs/migration-from-boltwall.md](../../docs/migration-from-boltwall.md) if
you are migrating from the legacy `bucko13/boltwall` package.
