---
name: local-lnd-testing
description: Use when an agent needs to run, inspect, or document local containerized LND regtest testing for @boltwall/adapters, including Docker lncli commands, wallet/channel/payment smoke checks, or bw-4vd7 harness validation.
---

# Local LND Testing

Use this skill for repo-local LND regtest work under
`packages/adapters/src/lnd/`. It complements `boltwall-workflow`: still claim
the bead, reserve files before edits, and keep credentials out of commits.

## Bundled Shortcut

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
prefix:

```json
[".agents/skills/local-lnd-testing/scripts/lncli-docker"]
```

Use direct `docker compose` only when debugging the topology lifecycle itself.

## Workflow

1. Read `packages/adapters/src/lnd/REGTEST.md` for the operator-facing runbook.
2. Start the topology with `packages/adapters/src/lnd/smoke.sh` or the compose
   file documented in `REGTEST.md`.
3. Use `lncli-docker alice ...` for the server node that backs `LndAdapter`.
4. Use `lncli-docker bob ...` for payer-side checks and payment commands.
5. For settled-flow proof, record only non-secret facts: command names, invoice
   status transitions, payment hash, and success/failure summaries. Never paste
   certs, macaroons, seeds, or full env files.

## Diagnostics

- `getinfo` checks whether the node is reachable and unlocked.
- `walletbalance` checks mined funds.
- `listchannels` checks channel state and liquidity.
- `pendingchannels` helps explain why a channel is not usable yet.
- `payinvoice --force <bolt11>` is the payer-side non-interactive payment path.

When a command fails, include the failing command, node (`alice` or `bob`), and
the relevant service log tail. Avoid logging bearer credentials.
