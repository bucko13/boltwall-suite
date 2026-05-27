# Local Regtest Proxy And Playground

This runbook proves Boltwall end to end on your machine:

1. start a two-node Bitcoin/LND regtest topology,
2. use the server node as the proxy payment backend,
3. run the local `boltwall` proxy in front of PokeAPI,
4. point the local playground at the protected Pokemon resource,
5. request the resource and receive an L402 invoice challenge,
6. pay the invoice from the payer node,
7. retry with the paid credential and verify the upstream PokeAPI response.

The flow uses local-only regtest funds. Do not use the generated Docker wallet
state, macaroons, certs, or deterministic dev wallet password for production.

## Prerequisites

- Docker available locally.
- Bun installed.
- Workspace dependencies installed:

```sh
bun install
```

## 1. Start Regtest LND

Use logical node names so the rest of the commands read naturally:

```sh
bun run bootstrap -- --nodes payer,server
```

`payer` pays invoices. `server` is the node the proxy uses to create and settle
invoices.

Prepare channel liquidity from `payer` to `server`:

```sh
bun run lightning -- ready payer server
```

For a proof payment outside the proxy, this should settle a 1 sat invoice:

```sh
bun run lightning -- move payer server 1
```

## 2. Export Server LND Env

In the shell that will run the proxy, export the server node connection values:

```sh
eval "$(bun run --silent lnd-env -- --node server --export)"
```

The helper exports the canonical local LND backend variables:

- `LND_SOCKET`
- `LND_TLS_CERT`
- `LND_MACAROON`

`LND_TLS_CERT` and `LND_MACAROON` are credential content, not filesystem paths.

For a redacted check:

```sh
bun run lnd-env -- --node server --summary
bun run lnd-env -- --node server --validate
```

## 3. Start The Local Proxy

Start the interactive CLI from the repo root:

```sh
bun run boltwall -- dev --port 4010
```

If you have no saved configs yet, the CLI creates one under
`~/.config/boltwall/`. Use these answers for the PokeAPI playground demo:

| Prompt                                                 | Answer                                        |
| ------------------------------------------------------ | --------------------------------------------- |
| Config name                                            | `local-regtest-pokedex`                       |
| Lightning backend                                      | `lnd`                                         |
| Allow browser apps to call this proxy                  | `yes`                                         |
| Browser origins allowed to call this proxy             | `http://127.0.0.1:3000,http://localhost:3000` |
| Upstream target URL                                    | `https://pokeapi.co/api/v2`                   |
| Default price for protected requests, in millisatoshis | `1000`                                        |
| Protected path                                         | `/pokemon/*`                                  |
| Price for this protected path, in millisatoshis        | `1000`                                        |
| Unprotected paths                                      | `/healthz`                                    |
| Service name for service/capability caveats            | press Enter                                   |
| Credential lifetime in seconds                         | press Enter                                   |
| Origin caveat origins                                  | press Enter                                   |
| Capability caveats to mint                             | press Enter                                   |
| Use HODL invoices                                      | `no`                                          |

The config stores routing metadata and environment variable names only. It does
not store the LND cert or macaroon values.

Do not set a service name for the basic Pokedex demo. Service and capability
caveats are advanced authorization policy: setting a service name causes minted
macaroons to include `services=<name>:0`, and setting capabilities adds
`<service>_capabilities=...`. L402 macaroon-spec.md §Caveat Format defines
those caveats, and §Verification defines how they are evaluated.

The protected Pokemon resource is now:

```text
http://127.0.0.1:4010/pokemon/1
```

Check the first request from another terminal:

```sh
curl -i http://127.0.0.1:4010/pokemon/1
```

Expected result:

- `HTTP/1.1 402 Payment Required`
- a `WWW-Authenticate` header with dual compatibility challenges (`LSAT` and
  `L402`)
- a BOLT11 invoice in the challenge

Copy the invoice and macaroon from the `WWW-Authenticate` header. Prefer the
`L402` challenge when both are present.

## 4. Run The Playground Against The Proxy

In a new shell:

```sh
NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT=http://127.0.0.1:4010/pokemon/{id} \
  bun run playground
```

Expected terminal output includes Next.js starting the playground on
`http://localhost:3000`. If you see unrelated Agent Mail or file-reservation
logs, the command is running in the wrong terminal process; open a fresh shell
in the repo root and run it there.

Open the local playground and go to the Demo panel:

```text
http://127.0.0.1:3000/p/demo
```

Click **Get Random Pokemon**. Expected result:

- status `payment`,
- the Demo shows the L402 challenge scheme, invoice, and macaroon,
- WebLN and manual preimage payment options are visible,
- browser devtools does not show a CORS error.

If Next.js starts the playground on another port, use the exact origin from the
browser address bar. For example, if the page is
`http://localhost:3001/p/demo`, add that origin before restarting the proxy:

```sh
bun run boltwall -- config allow-origin local-regtest-pokedex http://localhost:3001
```

If the challenge field is empty while `curl` can see the header, the proxy
config does not expose `WWW-Authenticate` to the browser origin. Check the saved
origins:

```sh
bun run boltwall -- config show local-regtest-pokedex
```

## 5. Pay From The Payer Node

If WebLN is not connected to the local payer node, pay the invoice from the
challenge with `lncli`:

```sh
bun run lncli -- payer payinvoice --force <bolt11-invoice>
```

Copy the 64-character hex payment preimage from the `lncli` output, paste it
into the Demo panel, and submit it to retry the request. Do not commit or
publish real preimages; they are bearer-credential material when paired with the
macaroon.

## 6. Optional Terminal Retry

The browser Demo performs the retry after WebLN payment or manual preimage
submit. To verify the same credential from a terminal, use the macaroon from
the chosen challenge and the preimage from the payment:

```sh
curl -i \
  -H "Authorization: L402 <macaroon>:<payment-preimage>" \
  http://127.0.0.1:4010/pokemon/1
```

Expected result:

- `HTTP/1.1 200 OK`,
- a PokeAPI JSON body for Pokemon #1,
- no backend secrets in the response or logs.

If you copied the legacy challenge instead, use `Authorization: LSAT
<macaroon>:<payment-preimage>`. The proxy accepts both for compatibility.

## Troubleshooting

- `Missing required environment variable`: re-run
  `eval "$(bun run --silent lnd-env -- --node server --export)"` in the
  same shell that starts the proxy.
- `402` after retry: make sure the macaroon and preimage came from the same
  challenge/invoice. A fresh first request creates a fresh invoice.
- Browser cannot read the challenge: edit the saved proxy config so browser
  clients are allowed and `http://127.0.0.1:3000` is listed as an origin.
- Invoice does not settle: run `bun run lightning -- ready payer server`
  again and check channel balances.

## Useful CLI Checks

```sh
bun run boltwall -- config list
bun run boltwall -- config show local-regtest-pokedex
bun run boltwall -- validate --config local-regtest-pokedex
```

`validate` loads the saved config, verifies required backend env values are
present, checks backend capability requirements, and prints summaries without
expanding credential values.
