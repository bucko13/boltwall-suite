---
name: local-lnd-testing
description: Use when an agent needs to run, inspect, or document local containerized LND regtest testing for @boltwall/adapters, including Docker lncli commands, wallet/channel/payment smoke checks, or bw-4vd7 harness validation.
---

# Local LND Testing

Use this skill when a user asks for a local Lightning test network: bootstrapping
regtest nodes, naming test nodes, funding them, moving funds, checking balances,
or running `lncli` against the Docker harness.

This skill complements `boltwall-workflow`: still claim beads, reserve files
before edits, and keep credentials out of commits.

## Interpret Requests

Map human-language requests to reusable local operations:

- "Spin up a local Lightning network" -> bootstrap the Docker regtest topology.
- "Use nodes carol and david" -> bootstrap with `--nodes carol,david`, then
  use those logical names in helper commands.
- "Fund the nodes" -> use `bun run infra -- lightning ready <from> <to>`.
- "Move funds from one node to another" -> create an invoice on the receiver,
  pay from the sender, and report before/after balances and payment status.
- "Run lncli" -> use the bundled `bun run infra -- lncli` helper, not raw Docker Compose.

Report useful proof output: node aliases, regtest network, wallet/channel
balances, payment hash/status, and command failures. Do not print certs,
macaroons, seeds, or env files.

## Downstream Package Routing

Use this harness for downstream work when a package needs a real LND-backed
settled-flow proof instead of pure unit tests:

- `@boltwall/adapters`: use `bun run infra -- smoke-adapter` for `LndAdapter`
  create/open/pay/settled proof, or `bun run infra -- lightning` when validating
  only channel readiness and payer liquidity.
- `@boltwall/middleware`: use `bun run infra -- lightning ready` before middleware tests
  need a payable invoice path, and use `lnd-env --node <server>` only when a
  local middleware process must construct `LndAdapterOptions`.
- `@boltwall/proxy`: use the same `lnd-env` contract for the upstream payment
  backend, then record proxy-facing status transitions rather than raw
  credential material.
- `@boltwall/playground`: use the harness only for local live-payment demos or
  e2e flows that intentionally depend on Docker LND. Fixture-only browser tests
  should not require this skill.

For operator background and historical proof, read
`packages/adapters/src/lnd/REGTEST.md` instead of duplicating the full LND
runbook in package docs.

## Lifecycle And Evidence

Keep the steps distinct so handoffs are easy to review:

1. Bootstrap: `bun run infra -- bootstrap --nodes <payer>,<server>` starts the topology
   and verifies aliases.
2. Env export: `lnd-env --node <server>` prints a redacted summary; use
   `--export` only inside the local shell that needs credentials.
3. Payment helper: `bun run infra -- lightning ready` proves channel readiness, and
   `bun run infra -- lightning move` proves a non-interactive settled invoice.
4. Adapter smoke: `bun run infra -- smoke-adapter` proves the same settled path through
   `LndAdapter`.
5. Diagnostics: use helper output first, then `bun run infra -- lncli` for targeted
   `getinfo`, `walletbalance`, `listchannels`, or `pendingchannels` checks.
6. Teardown: stop local containers only when no peer task depends on the shared
   topology. Do not remove Docker volumes, wallet state, env files, copied
   macaroons, or generated credentials unless the owner explicitly approves the
   destructive cleanup in the current session.

Record settled-flow evidence as command names, logical node names, status
transitions, amounts, payment hashes, and before/after balances. Never commit
or paste certs, macaroons, seeds, preimages, full `lnd-env --json` output,
`.env` files, or generated wallet artifacts.

## Bootstrap

First bootstrap the Docker regtest topology:

```sh
bun run infra -- bootstrap --nodes carol,david
```

The bootstrap command starts bitcoind, `lnd-alice`, and `lnd-bob`, waits for
LND REST, initializes missing wallets through LND REST with generated seeds
kept out of logs, then verifies both nodes with `lncli getinfo`. The containers
use a deterministic dev-only password inside the compose harness so agents do
not need the user to initialize wallets manually. `--nodes` assigns logical
non-secret names to the two internal roles and prints proof that `getinfo`
reports those aliases.

Use `--status` to inspect an already-running topology:

```sh
bun run infra -- bootstrap --status
```

## Node Commands

Use the bundled script instead of hand-writing Docker Compose `lncli` commands:

```sh
bun run infra -- lncli alice getinfo
bun run infra -- lncli carol getinfo
bun run infra -- lncli bob walletbalance
bun run infra -- lncli david payinvoice --force <bolt11>
```

It expands to:

```sh
docker compose -f packages/adapters/src/lnd/docker-compose.smoke.yml \
    exec -T lnd-<internal-role> lncli --network=regtest <args...>
```

The helper accepts internal roles (`alice`, `bob`) and logical names from the
last `bun run infra -- bootstrap --nodes <first>,<second>` run. The mapping is stored as
non-secret runtime state under the local temp directory, so a fresh agent in the
same checkout can target `carol` and `david` without prior session context.

If Docker access is sandbox-blocked, request approval for this narrow command
prefix for bootstrap work:

```json
["bun", "run", "infra"]
```

Request this narrow prefix for ad hoc `lncli` commands:

```json
["bun", "run", "infra"]
```

Use direct `docker compose` only when debugging the topology lifecycle itself.

## Funding And Payments

Use `bun run infra -- lightning` for reusable network operations instead of composing raw
`bitcoin-cli` and `lncli` calls:

```sh
bun run infra -- lightning ready carol david
bun run infra -- lightning move carol david 1000
bun run infra -- lightning balances carol david
```

`ready <from> <to> [local-sats]` bootstraps the requested logical names, funds
nodes when needed, connects peers, opens/confirms a channel, and prints
before/after balances. `move <from> <to> [sats]` creates an invoice on the
receiver, pays it from the sender, looks up settlement, and prints payment
status plus before/after balances. `balances [node...]` reports wallet and
channel liquidity for logical names or internal roles.

Other reusable operations are available when a task needs one step at a time:
`fund`, `fund-all`, `connect`, and `open-channel`. Report proof from these
commands directly; it is designed to avoid seeds, certs, macaroons, preimages,
and env files.

If Docker access is sandbox-blocked, request approval for this narrow command
prefix:

```json
["bun", "run", "infra"]
```

## LndAdapter Smoke

Use `bun run infra -- smoke-adapter` when a task needs proof that `@boltwall/adapters/lnd`
can create a real invoice and observe settlement through the `lightning` npm
package:

```sh
bun run infra -- smoke-adapter --payer carol --server david --amount-msat 1000
```

The helper ensures payer-to-server channel readiness, derives the server LND
env contract without printing credentials, normalizes the host socket to avoid
IP-address TLS server-name failures in `lightning`, creates a `LndAdapter`
invoice, pays it with `bun run infra -- lncli`, then prints proof-safe output: local
BOLT11, payment hash, open/settled statuses, amount, and preimage shape.

Never paste certs, macaroons, seeds, env files, or full helper debug traces into
task notes. The helper output is intended for `REGTEST.md` evidence because it
redacts credential material by construction.

## Ephemeral LND Env Contract

Use `lnd-env` when adapter, middleware, proxy, or playground code needs to talk
to the server LND node from the host process:

```sh
bun run infra -- lnd-env
```

The default mode prints a redacted summary for logs and names the expected
environment variables:

- `LND_SOCKET` -> `LndAdapterOptions.socket`
- `LND_TLS_CERT` -> `LndAdapterOptions.cert`
- `LND_MACAROON` -> `LndAdapterOptions.macaroon`

To export the local-only credential values into the current shell, make the
credential-bearing mode explicit:

```sh
eval "$(bun run --silent infra -- lnd-env --export)"
```

Use `--node <name>` to target an internal role (`alice`, `bob`) or a logical
name from `bun run infra -- bootstrap --nodes <first>,<second>`. The default is `alice`,
the server role intended for `LndAdapter` smoke checks. `--json` is available
for local process handoff, and `--validate` constructs `LndAdapter` with the
derived values without printing certs or macaroons.

Never commit exported values, `.env` files, certs, macaroons, or full `--json`
output. Downstream tests should consume these values only as ephemeral local
environment variables.

## Workflow

1. Read `packages/adapters/src/lnd/REGTEST.md` for the operator-facing runbook.
2. Start the topology with `bun run infra -- bootstrap`.
3. Use requested logical names in helper commands; the first logical node maps
   to `lnd-alice`, and the second maps to `lnd-bob`.
4. Use `lnd-env --node <first>` to export adapter env values for the server
   node when code needs `LndAdapterOptions`.
5. Use `bun run infra -- lightning ready <first> <second>` before tests need spendable
   channel liquidity.
6. Use `bun run infra -- lightning move <from> <to> <sats>` for payment proof.
7. Use `bun run infra -- smoke-adapter --payer <first> --server <second>` when the proof must
   go through `LndAdapter` instead of raw `lncli` invoice creation.
8. Use `bun run infra -- lncli <node> ...` only for ad hoc node inspection that is not
   covered by the higher-level helper.
9. For settled-flow proof, record only non-secret facts: command names, invoice
   status transitions, payment hash, and success/failure summaries. Never paste
   certs, macaroons, seeds, or full env files.

## Diagnostics

- `getinfo` checks whether the node is reachable and unlocked.
- `walletbalance` checks mined funds.
- `listchannels` checks channel state and liquidity.
- `pendingchannels` helps explain why a channel is not usable yet.
- `payinvoice --force <bolt11>` is the payer-side non-interactive payment path.
- `bun run infra -- lightning ready` distinguishes funding, peer connection, and channel
  readiness failures.
- `bun run infra -- lightning move` distinguishes invoice creation, payment, and settled
  lookup failures.

When a command fails, include the failing command, node (`alice` or `bob`), and
the relevant service log tail. Avoid logging bearer credentials.
