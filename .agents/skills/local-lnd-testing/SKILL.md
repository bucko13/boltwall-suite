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
.agents/skills/local-lnd-testing/scripts/bootstrap-regtest --nodes carol,david
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
.agents/skills/local-lnd-testing/scripts/bootstrap-regtest --status
```

## Node Commands

Use the bundled script instead of hand-writing Docker Compose `lncli` commands:

```sh
.agents/skills/local-lnd-testing/scripts/lncli-docker alice getinfo
.agents/skills/local-lnd-testing/scripts/lncli-docker carol getinfo
.agents/skills/local-lnd-testing/scripts/lncli-docker bob walletbalance
.agents/skills/local-lnd-testing/scripts/lncli-docker david payinvoice --force <bolt11>
```

It expands to:

```sh
docker compose -f packages/adapters/src/lnd/docker-compose.smoke.yml \
    exec -T lnd-<internal-role> lncli --network=regtest <args...>
```

The helper accepts internal roles (`alice`, `bob`) and logical names from the
last `bootstrap-regtest --nodes <first>,<second>` run. The mapping is stored as
non-secret runtime state under the local temp directory, so a fresh agent in the
same checkout can target `carol` and `david` without prior session context.

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

## Ephemeral LND Env Contract

Use `lnd-env` when adapter, middleware, proxy, or playground code needs to talk
to the server LND node from the host process:

```sh
.agents/skills/local-lnd-testing/scripts/lnd-env
```

The default mode prints a redacted summary for logs and names the expected
environment variables:

- `LND_SOCKET` -> `LndAdapterOptions.socket`
- `LND_CERT_BASE64` -> `LndAdapterOptions.cert`
- `LND_MACAROON_BASE64` -> `LndAdapterOptions.macaroon`

To export the local-only credential values into the current shell, make the
credential-bearing mode explicit:

```sh
eval "$(.agents/skills/local-lnd-testing/scripts/lnd-env --export)"
```

Use `--node <name>` to target an internal role (`alice`, `bob`) or a logical
name from `bootstrap-regtest --nodes <first>,<second>`. The default is `alice`,
the server role intended for `LndAdapter` smoke checks. `--json` is available
for local process handoff, and `--validate` constructs `LndAdapter` with the
derived values without printing certs or macaroons.

Never commit exported values, `.env` files, certs, macaroons, or full `--json`
output. Downstream tests should consume these values only as ephemeral local
environment variables.

## Workflow

1. Read `packages/adapters/src/lnd/REGTEST.md` for the operator-facing runbook.
2. Start the topology with `bootstrap-regtest`.
3. Use requested logical names in helper commands; the first logical node maps
   to `lnd-alice`, and the second maps to `lnd-bob`.
4. Use `lnd-env --node <first>` to export adapter env values for the server
   node when code needs `LndAdapterOptions`.
5. Use `lncli-docker <first> ...` for server-side node checks.
6. Use `lncli-docker <second> ...` for payer-side checks and payment commands.
7. For settled-flow proof, record only non-secret facts: command names, invoice
   status transitions, payment hash, and success/failure summaries. Never paste
   certs, macaroons, seeds, or full env files.

## Follow-Up Capabilities

The bootstrap foundation is in place. These beads track the higher-level skill
operations that human prompts naturally expect:

- `bw-4vd7.8`: funding, channel readiness, balance checks, and moving funds.

## Diagnostics

- `getinfo` checks whether the node is reachable and unlocked.
- `walletbalance` checks mined funds.
- `listchannels` checks channel state and liquidity.
- `pendingchannels` helps explain why a channel is not usable yet.
- `payinvoice --force <bolt11>` is the payer-side non-interactive payment path.

When a command fails, include the failing command, node (`alice` or `bob`), and
the relevant service log tail. Avoid logging bearer credentials.
