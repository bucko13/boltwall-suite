# Boltwall Express Server Example

A minimal Express server protected by L402 payment authentication using
`@boltwall/middleware` with `MockAdapter` (no real Lightning node required).

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

### Step 3 — Simulate payment (MockAdapter only)

`MockAdapter` exposes a `settle(paymentHash, preimage)` test helper, but for
this walkthrough we use a simple Node script to simulate payment:

```ts
// settle.ts — run with: bun run settle.ts
import { MockAdapter } from "@boltwall/adapters/testing";

// In a real app the backend instance is shared; here we demo the concept.
const PAYMENT_HASH = process.argv[2]; // from the invoice
const PREIMAGE = "0".repeat(64);      // 32-byte zero preimage for demo

console.log("Preimage:", PREIMAGE);
console.log("(In production: the wallet pays the BOLT 11 invoice and returns the preimage.)");
```

For a real Lightning wallet, pay the BOLT 11 invoice and capture the preimage
it returns on settlement.

### Step 4 — Retry with credential

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

Replace `MockAdapter` with `LndAdapter` from `@boltwall/adapters/lnd`:

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
