# Local Regtest Proxy And Playground

This runbook proves Boltwall end to end on your machine:

1. start a two-node Bitcoin/LND regtest topology,
2. use the server node as the proxy payment backend,
3. protect PokeAPI through the local `boltwall` proxy,
4. point the local playground at the protected Pokemon resource,
5. request the resource, receive an L402 invoice challenge,
6. pay the invoice from the payer node,
7. retry with the paid credential and verify the upstream PokeAPI response.

The flow uses local-only regtest funds. Do not use the generated Docker wallet
state, macaroons, certs, or deterministic dev wallet password for production.

## Current Product Boundary

The playground Demo panel is the visible browser flow. With no proxy configured
it fetches a random Pokemon from public PokeAPI and reports that no L402
challenge was returned. When pointed at a protected endpoint, it requests a
random Pokemon, shows the returned L402 challenge, lets the user pay with WebLN
or paste a paid preimage manually, retries with the credential, and renders the
Pokemon response.

The normal playground still does not host a real `/api/pokemon/:id` route. It
consumes public PokeAPI or a configured external proxy endpoint.

Because the playground dev server and proxy run on different ports, the proxy
config below opts into CORS for the local playground origin and exposes
`WWW-Authenticate` so browser JavaScript can read the L402 challenge.

## Prerequisites

- Docker available locally.
- Bun installed.
- Workspace dependencies installed in this repo:

```sh
bun install --frozen-lockfile
```

If the lockfile is stale, stop and run the repo's normal lockfile reconcile
workflow instead of committing `bun.lock` from unrelated work.

## 1. Start Regtest LND

Use logical node names so the rest of the commands read naturally:

```sh
.agents/skills/local-lnd-testing/scripts/bootstrap-regtest --nodes payer,server
```

`payer` maps to the node that will pay invoices. `server` maps to the node the
proxy uses to create and settle invoices.

Prepare channel liquidity from `payer` to `server`:

```sh
.agents/skills/local-lnd-testing/scripts/lightning-regtest ready payer server
.agents/skills/local-lnd-testing/scripts/lightning-regtest balances payer server
```

For a proof payment outside the proxy, this should settle a 1 sat invoice:

```sh
.agents/skills/local-lnd-testing/scripts/lightning-regtest move payer server 1
```

## 2. Export Server LND Env

In the shell that will run the proxy, export the server node connection values:

```sh
eval "$(.agents/skills/local-lnd-testing/scripts/lnd-env --node server --export)"
```

The export mode prints credential-bearing values into the current shell only.
Do not paste that output into docs, issues, chat, logs, or committed files.

For a redacted check:

```sh
.agents/skills/local-lnd-testing/scripts/lnd-env --node server --summary
.agents/skills/local-lnd-testing/scripts/lnd-env --node server --validate
```

The helper exports:

- `LND_SOCKET`
- `LND_CERT_BASE64`
- `LND_MACAROON_BASE64`

The proxy config below maps those names explicitly.

## 3. Create Local Proxy Config

Create `boltwall.local.yaml` outside version control or keep it untracked:

```yaml
name: local-regtest-pokedex
targetUrl: https://pokeapi.co/api/v2
service: pokedex
backend:
  kind: lnd
  env:
    socket: LND_SOCKET
    cert: LND_CERT_BASE64
    macaroon: LND_MACAROON_BASE64
pricing:
  defaultPriceMsat: "1000"
routes:
  - path: /pokemon/*
    methods: [GET]
    priceMsat: "1000"
challengeCompatibility: dual
unprotectedPaths:
  - /healthz
forwardHeaders:
  allow: [accept, content-type, x-request-id]
  deny: [authorization, cookie]
cors:
  allowOrigins:
    - http://127.0.0.1:3000
    - http://localhost:3000
  allowMethods: [GET, OPTIONS]
  allowHeaders: [Authorization, Content-Type]
  maxAgeSeconds: 600
upstreamTimeoutMs: 10000
deploy:
  target: vercel
  projectName: local-regtest-pokedex
```

The file stores only variable names and non-secret routing metadata. The actual
cert and macaroon stay in your shell.

Validate the config:

```sh
bun run --cwd packages/proxy build
bun packages/proxy/dist/cli.js validate --config ./boltwall.local.yaml
```

Expected validation output is a config summary plus backend capability flags.
It should not print certs, macaroons, preimages, or `.env` contents.

## 4. Run The Local Proxy

Start the proxy on a non-playground port:

```sh
bun packages/proxy/dist/cli.js dev --config ./boltwall.local.yaml --port 4010
```

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

## 5. Run The Playground Against The Proxy

In a new shell:

```sh
NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT=http://127.0.0.1:4010/pokemon/{id} \
  bun run dev
```

Open the local playground and go to the Demo panel:

```text
http://127.0.0.1:3000/p/demo
```

Click **Get Random Pokemon**. Expected result:

- status `payment`,
- the Demo shows the L402 challenge scheme, invoice, and macaroon,
- WebLN and manual preimage payment options are visible,
- browser devtools does not show a CORS error.

If the challenge field is empty while `curl` can see the header, the proxy
origin is not exposing `WWW-Authenticate` to the browser. For cross-origin
browser demos, the protected endpoint must allow the playground origin and
expose the `WWW-Authenticate` response header.

## 6. Pay From The Payer Node

If WebLN is not connected to the local payer node, pay the invoice from the
challenge with `lncli`:

```sh
.agents/skills/local-lnd-testing/scripts/lncli-docker payer payinvoice --force <bolt11-invoice>
```

Copy the 64-character hex payment preimage from the `lncli` output, paste it
into the Demo panel, and submit it to retry the request. Do not commit or
publish real preimages; they are bearer-credential material when paired with the
macaroon.

## 7. Optional Terminal Retry

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

- `Missing required environment variable`: re-run `lnd-env --node server
--export` in the same shell that starts the proxy.
- `402` after retry: make sure the macaroon and preimage came from the same
  challenge/invoice. A fresh first request creates a fresh invoice.
- `curl` succeeds but browser cannot read the challenge: fix CORS on the
  protected endpoint so the playground origin is allowed and
  `WWW-Authenticate` is exposed.
- Invoice does not settle: run `lightning-regtest ready payer server` again and
  check channel balances.

## Validation Notes

The proxy payment flow can be fully validated with Docker plus the terminal
commands above. The browser challenge-inspection step requires the CORS
allowlist shown in the config when the playground and proxy are on different
origins. Steps that print credential-bearing values are intentionally local
shell operations only; do not record their raw output in commits or task notes.
