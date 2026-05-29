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
export LND_TLS_CERT="<base64-cert>"
export LND_MACAROON="<base64-macaroon>"
```

### 4) Run adapter verification script/REPL (copy/paste checklist)

In a local script or REPL:

```ts
import { LndAdapter } from "@boltwall/adapters/lnd";

const lnd = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  cert: process.env.LND_TLS_CERT!,
  macaroon: process.env.LND_MACAROON!,
});

const created = await lnd.createInvoice({
  amountMsat: 1000n,
  description: "boltwall-regtest",
});
console.log(created.paymentRequest);
console.log(created.paymentHash);

const openLookup = await lnd.lookupInvoice(created.paymentHash);
console.log(openLookup);
```

Expected after create:

- BOLT11 request starts with `lnbcrt`.
- `lookupInvoice` status is `open`.

### 5) Pay invoice from payer node, then re-check

Pay `created.paymentRequest` from the payer node in Polar (or payer node CLI).
Then:

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

Scriptable maintainer steps after prerequisites:

- Adapter construction from env vars.
- `createInvoice` -> `lookupInvoice(open)` checks.
- Post-payment `lookupInvoice(settled)` checks.
- HODL settle/cancel verification logic.

This split is intentional for now: scripted checks are reliable once a local
operator has a healthy Polar network and credentials ready.

## Polar Automation Feasibility

### Automation constraints

Polar is a GUI-first Electron app. It has no stable published CLI, and its
internal Docker and gRPC plumbing are not documented as a scriptable API. As a
result, several steps in the local workflow have no reliable headless path:

| Verification step                     | Scriptable? | Notes                                                                                          |
| ------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| Launch Polar app                      | No          | GUI app only; no supported CLI entrypoint.                                                     |
| Bootstrap regtest network             | No          | Polar drives Docker internally, but no stable scripted entrypoint is available.                |
| Open/fund channel in Polar            | No          | Depends on GUI or undocumented app internals.                                                  |
| Extract server cert + admin macaroon  | Partial     | Feasible only after the operator exposes or copies the values; no stable filesystem path here. |
| Run `LndAdapter` create/lookup checks | Yes         | Once `LND_SOCKET`, `LND_TLS_CERT`, and `LND_MACAROON` are exported, the adapter smoke runs.   |
| Pay invoice from peer node            | Partial     | Scriptable if payer-node CLI/container access exists; otherwise manual in Polar.               |
| HODL settle/cancel verification       | Yes         | Scriptable after the network and credentials exist.                                            |

The dependable automation boundary starts _after_ a healthy local network
already exists and credentials have been exported into env vars.

## Recommended Local And CI Split

### Local operator-assisted flow

Keep Polar as the shortest path for a human maintainer to:

1. launch the network,
2. open/fund channels,
3. retrieve the first cert/macaroon set,
4. optionally pay invoices from the UI.

After that setup, scripted checks should use only exported env vars and adapter
calls.

### CI/container automation path

Do not build CI around Polar's desktop UI. Instead, create a dedicated
containerized LND smoke harness that owns:

1. regtest bootstrap,
2. wallet unlock/init,
3. channel funding/open,
4. cert/macaroon extraction,
5. invoice creation and payment loop,
6. teardown or explicit reset.

That harness can back both:

- a local maintainer-run smoke for environments with Docker access, and
- a skipped-by-default or explicitly gated CI/manual workflow.

## Minimal Proof Sequence For The Recommended Harness

Current repository command shape:

```bash
# 1. Start the regtest topology with logical node names.
bun run bootstrap -- --nodes payer,server

# 2. Fund/connect/open a channel when needed.
bun run lightning -- ready payer server

# 3. Run the LndAdapter settled-payment smoke.
bun run smoke-adapter -- --payer payer --server server --amount-msat 1000

# 4. Stop containers but preserve wallets/channels/chain state.
bun run infra -- teardown

# 5. Remove wallets/channels/chain state only when a clean reset is intended.
bun run infra -- teardown --reset --yes
```

This proof sequence is intentionally container-first. It avoids depending on
undocumented Polar app internals and is a better fit for maintainer-run
automation.

`teardown` uses `docker compose stop` and keeps Docker volumes intact. The
explicit `--reset --yes` path uses `docker compose down --volumes --remove-orphans`
and removes the local regtest wallets, channels, certs, macaroons, and chain
state owned by this harness.

## Risks And Constraints

- Docker availability is the main local automation dependency.
- LND startup and channel-confirmation timing will need explicit waits/retries.
- Credential extraction must stay ephemeral; never commit certs or macaroons.
- Host-specific app paths, GUI automation, and copied Polar state are too flaky
  to make the primary verification path.

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

## Smoke Run Example

```bash
infra/scripts/smoke-adapter --payer <payer-node> --server <server-node> --amount-msat 1000
```

Expected output shape after a successful create + pay cycle:

```text
LndAdapter open proof:
  payment_request=lnbcrt10n...  amount_msat=1000  open_status=open
LndAdapter settled proof:
  payment_status=SETTLED_LOOKUP_CONFIRMED  lookup_status=settled
  amount_msat=1000  preimage_present=true  preimage_length=64
```

Credential handling: the smoke script reads credentials via `lnd-env` but does
not print or persist TLS certs, macaroons, or the settlement preimage value.
