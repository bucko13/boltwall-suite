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

Scriptable/agent-friendly steps after prerequisites:

- Adapter construction from env vars.
- `createInvoice` -> `lookupInvoice(open)` checks.
- Post-payment `lookupInvoice(settled)` checks.
- HODL settle/cancel verification logic.

This split is intentional for now: agent-run checks are reliable once a local
operator has a healthy Polar network and credentials ready.

## Polar Automation Feasibility

Repository/session findings from 2026-05-12:

- `Polar.app` is installed locally, but there is no `polar` CLI on `PATH`.
- There is no `lncli` on `PATH` in this session.
- Polar appears to be an Electron app bundle with internal Docker and gRPC
  plumbing, but no stable repo-local automation entrypoint is documented here.
- Agent-run Docker access is a prerequisite for any fully automated local
  network bootstrap; in this session, direct Docker access was unavailable.

### Control-surface assessment

| Verification step                     | Agent-runnable through Polar today? | Why                                                                                                                     |
| ------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Launch Polar app                      | No reliable headless path           | GUI app is installed, but no supported CLI was found.                                                                   |
| Bootstrap regtest network             | No reliable headless path           | Polar likely drives Docker internally, but this repo has no stable scripted entrypoint for that lifecycle.              |
| Open/fund channel in Polar            | No reliable headless path           | This currently depends on the GUI or undocumented app internals.                                                        |
| Extract server cert + admin macaroon  | Partial                             | Feasible only after the operator exposes or copies the values; this doc does not rely on undocumented filesystem paths. |
| Run `LndAdapter` create/lookup checks | Yes                                 | Once `LND_SOCKET`, `LND_CERT_BASE64`, and `LND_MACAROON_BASE64` are exported, the adapter smoke is scriptable.          |
| Pay invoice from peer node            | Partial                             | Scriptable if payer-node CLI/container access exists; otherwise still manual in Polar.                                  |
| HODL settle/cancel verification       | Yes                                 | Scriptable after the network and credentials exist.                                                                     |

### Practical conclusion

Polar is a good local operator tool, but it is not a good primary automation
surface for agent-run verification in this repository today. The dependable
automation boundary starts _after_ a healthy local network already exists and
credentials have been exported into env vars.

## Recommended Local And CI Split

### Local operator-assisted flow

Keep Polar as the shortest path for a human maintainer to:

1. launch the network,
2. open/fund channels,
3. retrieve the first cert/macaroon set,
4. optionally pay invoices from the UI.

After that handoff, agent-run checks should use only exported env vars and
scripted adapter calls.

### Agent/CI automation path

Do not build CI around Polar's desktop UI. Instead, create a dedicated
containerized LND smoke harness that owns:

1. regtest bootstrap,
2. wallet unlock/init,
3. channel funding/open,
4. cert/macaroon extraction,
5. invoice creation and payment loop,
6. teardown.

That harness can back both:

- a local agent-run smoke for maintainers with Docker access, and
- a skipped-by-default or explicitly gated CI/manual workflow.

## Minimal Proof Sequence For The Recommended Harness

Current repository command shape:

```bash
# 1. Start containers + export LND_* vars.
packages/adapters/src/lnd/smoke.sh

# 2. If first run times out waiting for admin.macaroon, initialize wallet once:
docker compose -f packages/adapters/src/lnd/docker-compose.smoke.yml exec lnd-alice lncli --network=regtest create

# 3. Re-run the smoke script after wallet creation.
packages/adapters/src/lnd/smoke.sh
```

This proof sequence is intentionally container-first. It avoids depending on
undocumented Polar app internals and is a better fit for agent execution.

Current limitation:

- The committed harness is a first-cut bootstrap/export path and does not yet
  fully automate channel open + payer invoice settlement end-to-end.

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

## Recorded Manual Run

Run date: 2026-05-12

Command:

```bash
.agents/skills/local-lnd-testing/scripts/lnd-adapter-smoke --payer carol --server david --amount-msat 1000
```

Topology proof:

```text
Preparing local LND topology: payer=carol server=david local_sats=1000000
Balances before readiness:
carol (carol): wallet_confirmed=504997999668 sat channel_local=1990060 sat channel_remote=3000 sat active_channels=2
david (david): wallet_confirmed=70000000000 sat channel_local=3000 sat channel_remote=1990060 sat active_channels=2
channel already active: carol -> david
Balances after readiness:
carol (carol): wallet_confirmed=504997999668 sat channel_local=1990060 sat channel_remote=3000 sat active_channels=2
david (david): wallet_confirmed=70000000000 sat channel_local=3000 sat channel_remote=1990060 sat active_channels=2
Creating invoice with LndAdapter: server=david socket=localhost:10010 amount_msat=1000
```

Adapter proof:

```text
LndAdapter open proof:
  payment_request=lnbcrt10n1p4q89y7pp5rhqjy54em34aldkv3cz53d80u6ylyrewepdzkryusnpfctmszp8qdp2vfhkcarhv9kxcttvdejz6ctyv9c8getj94ek6mmtv5cqzzsxqr23ssp5hmsgnyvmundlnuxljs3am8yfxadl34htm09cp2lwee8vnfwnprcs9qxpqysgq4w4n4lqmxude7atqyvx52080qqjdquypcgngc3lh8stll6zssyy32rye3w0m7lhx4me3za8qahcg96qx7exswxq84ha073tgxusfascpguy308
  payment_hash=1dc12252b9dc6bdfb6cc8e0548b4efe689f20f2ec85a2b0c9c84c29c2f70104e amount_msat=1000 open_status=open
Paying invoice from carol...
LndAdapter settled proof:
  payer=carol server=david payment_status=SETTLED_LOOKUP_CONFIRMED lookup_status=settled
  payment_hash=1dc12252b9dc6bdfb6cc8e0548b4efe689f20f2ec85a2b0c9c84c29c2f70104e amount_msat=1000 preimage_present=true preimage_length=64
```

Credential handling: the smoke used `lnd-env --node david --json` internally
but did not print or persist TLS certs, macaroons, seeds, env files, or the
settlement preimage value. The helper normalized Docker's `127.0.0.1` gRPC
socket to `localhost:10010` for the `lightning` package TLS server-name check.
