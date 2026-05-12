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
- "Use nodes carol and david" -> use logical node-name support when available;
  until `bw-4vd7.7` lands, use Alice and Bob internally and state that limit.
- "Fund the nodes" -> use the funding/channel helper once `bw-4vd7.8` lands.
- "Move funds from one node to another" -> create an invoice on the receiver,
  pay from the sender, and report before/after balances and payment status.
- "Run lncli" -> use the bundled `lncli-docker` helper, not raw Docker Compose.

Report useful proof output: node aliases, regtest network, wallet/channel
balances, payment hash/status, and command failures. Do not print certs,
macaroons, seeds, or env files.

## Bootstrap

First bootstrap the Docker regtest topology:

```sh
.agents/skills/local-lnd-testing/scripts/bootstrap-regtest
```

The bootstrap command starts bitcoind, `lnd-alice`, and `lnd-bob`, waits for
LND REST, initializes missing wallets through LND REST with generated seeds
kept out of logs, then verifies both nodes with `lncli getinfo`. The containers
use a deterministic dev-only password inside the compose harness so agents do
not need the user to initialize wallets manually.

Use `--status` to inspect an already-running topology:

```sh
.agents/skills/local-lnd-testing/scripts/bootstrap-regtest --status
```

## Node Commands

Use the bundled script instead of hand-writing Docker Compose `lncli` commands:

```sh
.agents/skills/local-lnd-testing/scripts/lncli-docker alice getinfo
.agents/skills/local-lnd-testing/scripts/lncli-docker bob walletbalance
.agents/skills/local-lnd-testing/scripts/lncli-docker bob payinvoice --force <bolt11>
```

It expands to:

```sh
docker compose -f packages/adapters/src/lnd/docker-compose.smoke.yml \
  exec -T lnd-<alice|bob> lncli --network=regtest <args...>
```

If Docker access is sandbox-blocked, request approval for this narrow command
prefix for bootstrap work:

```json
[".agents/skills/local-lnd-testing/scripts/bootstrap-regtest"]
```

Request this narrow prefix for ad hoc `lncli` commands:

```json
[".agents/skills/local-lnd-testing/scripts/lncli-docker"]
```

Use direct `docker compose` only when debugging the topology lifecycle itself.

## Workflow

1. Read `packages/adapters/src/lnd/REGTEST.md` for the operator-facing runbook.
2. Start the topology with `bootstrap-regtest`.
3. Resolve requested logical node names to harness nodes. Today the harness is
   two-node Alice/Bob; `bw-4vd7.7` tracks first-class custom names.
4. Use `lncli-docker alice ...` for the server node that backs `LndAdapter`.
5. Use `lncli-docker bob ...` for payer-side checks and payment commands.
6. For settled-flow proof, record only non-secret facts: command names, invoice
   status transitions, payment hash, and success/failure summaries. Never paste
   certs, macaroons, seeds, or full env files.

## Follow-Up Capabilities

The bootstrap foundation is in place. These beads track the higher-level skill
operations that human prompts naturally expect:

- `bw-4vd7.7`: logical node names such as carol/david.
- `bw-4vd7.8`: funding, channel readiness, balance checks, and moving funds.
- `bw-4vd7.4`: ephemeral LND env export for adapters, middleware, proxy, and
  playground tests.

## Diagnostics

- `getinfo` checks whether the node is reachable and unlocked.
- `walletbalance` checks mined funds.
- `listchannels` checks channel state and liquidity.
- `pendingchannels` helps explain why a channel is not usable yet.
- `payinvoice --force <bolt11>` is the payer-side non-interactive payment path.

When a command fails, include the failing command, node (`alice` or `bob`), and
the relevant service log tail. Avoid logging bearer credentials.
