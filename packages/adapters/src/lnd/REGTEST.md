# LndAdapter Regtest Verification

`LndAdapter` talks to LND through the maintained `lightning` npm package. Unit
tests stub that package, so this manual smoke confirms the real gRPC path.

## Prerequisites

- Polar installed from <https://lightningpolar.com/> and able to launch a local
  regtest network.
- A topology with at least:
  - one LND node for `LndAdapter` (the "server" node),
  - one peer node that can pay invoices.
- A funded/open channel from payer node -> server node with enough inbound
  liquidity on the server side for the test invoice.
- Bun workspace dependencies installed (`bun install` at repo root).

Security notes:

- Never commit certs, macaroons, or copied node credentials.
- Never paste admin macaroon values in public logs/issues.

## Polar-first Local Development Flow

### 1) Start network and prepare liquidity (manual in Polar)

1. Start Polar and run the network.
2. Open at least one channel from payer node to server LND node.
3. Ensure channel confirms and has spendable balance from payer node.

### 2) Collect server node connection material (manual in Polar)

From the server LND node details, collect:

- gRPC socket (for example `127.0.0.1:10009`)
- TLS cert (PEM)
- admin macaroon (hex or file path, depending on Polar view)

### 3) Convert credentials to `LndAdapter` env values

`LndAdapterOptions` expects base64 for both `cert` and `macaroon`.

- If cert is PEM text: base64-encode the full PEM content.
- If macaroon is hex: convert hex -> bytes -> base64.
- If macaroon is a file: base64-encode file bytes directly.

Set env vars:

```bash
export LND_SOCKET="127.0.0.1:10009"
export LND_CERT_BASE64="<base64-cert>"
export LND_MACAROON_BASE64="<base64-macaroon>"
```

### 4) Run adapter verification script/REPL (copy/paste checklist)

In a local script or REPL:

```ts
import { LndAdapter } from "@boltwall/adapters/lnd";

const lnd = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  cert: process.env.LND_CERT_BASE64!,
  macaroon: process.env.LND_MACAROON_BASE64!,
});

const created = await lnd.createInvoice({
  amountMsat: 1000n,
  description: "boltwall-regtest",
});
console.log(created.request);
console.log(created.paymentHash);

const openLookup = await lnd.lookupInvoice(created.paymentHash);
console.log(openLookup);
```

Expected after create:

- BOLT11 request starts with `lnbcrt`.
- `lookupInvoice` status is `open`.

### 5) Pay invoice from payer node, then re-check

Pay `created.request` from the payer node in Polar (or payer node CLI). Then:

```ts
const settled = await lnd.lookupInvoice(created.paymentHash);
console.log(settled);
```

Expected settled shape:

```ts
{
  status: "settled",
  paymentHash: "<64 lowercase hex chars>",
  amountMsat: 1000n,
  preimage: "<64 lowercase hex chars>"
}
```

## HODL Flow

For HODL verification, create a 32-byte preimage, hash it with SHA-256, and pass
the hash to:

```ts
await lnd.createInvoice({
  amountMsat: 1000n,
  description: "boltwall-hodl-regtest",
  hodl: true,
  paymentHash,
});
```

After the paying peer sends the payment and LND reports the invoice as held,
call `settleHodlInvoice(preimage)` and verify `lookupInvoice(paymentHash)` moves
to `settled`. If the payment should be abandoned, call
`cancelInvoice(paymentHash)` before the CLTV timeout.

## What Is Manual vs Scriptable Today

Manual/operator steps:

- Polar app launch and network lifecycle.
- Initial channel open/funding/liquidity setup.
- First-time credential retrieval from Polar UI.

Scriptable/agent-friendly steps after prerequisites:

- Adapter construction from env vars.
- `createInvoice` -> `lookupInvoice(open)` checks.
- Post-payment `lookupInvoice(settled)` checks.
- HODL settle/cancel verification logic.

This split is intentional for now: agent-run checks are reliable once a local
operator has a healthy Polar network and credentials ready.

## Troubleshooting

- `connection-refused` or timeouts:
  - confirm Polar network is running,
  - confirm `LND_SOCKET` matches the server node's gRPC port,
  - check host firewall/port conflicts.
- TLS errors:
  - wrong cert/node pairing,
  - malformed base64 cert payload (extra whitespace/newlines).
- `unauthorized`:
  - macaroon missing/invalid,
  - macaroon from wrong node/network,
  - base64 conversion done on hex string text instead of raw bytes.
- Invoice stays `open` after payment:
  - no route/liquidity from payer to server,
  - payment attempted from wrong node/network,
  - payer channel unconfirmed or offline.

## Recorded Manual Run

Not yet run in this repository session. The implementation and stubbed unit
tests are ready; closing the task still requires an owner-machine regtest run
with real socket, certificate, macaroon, BOLT 11 request, open lookup, payment,
and settled lookup evidence pasted here.
