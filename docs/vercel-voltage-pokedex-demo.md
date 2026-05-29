# Deploy an L402 proxy to Vercel (Voltage LND)

This runbook deploys an `@boltwall/proxy` in front of an existing HTTP API on
Vercel, backed by a [Voltage](https://voltageapp.io)-hosted LND node, and walks
the full challenge → pay → retry path. Voltage is the primary example because it
gives you a hosted LND endpoint reachable from Vercel; self-hosted LND works the
same way (see the note below).

The example protects the public PokeAPI (`https://pokeapi.co/api/v2`) so you can
follow it end to end, but every value here is yours to change.

## Prerequisites

- Bun installed.
- Vercel CLI installed and authenticated (`vercel login`).
- A running LND node with inbound liquidity to receive test payments, and a
  macaroon permitted to create and look up invoices. With Voltage, the node API
  base URL and macaroon come from the Voltage dashboard.
- A local checkout of this repository if you are deploying the workspace
  `@boltwall/proxy` before it is published.

References: [Vercel CLI deploy](https://vercel.com/docs/cli/deploy) — stdout is
the deployment URL, `--prod` deploys to production, and `vercel env add NAME
--sensitive` stores a value with hidden contents. [Voltage LND node
API](https://docs.voltage.cloud/lnd-node-api) — REST is on port `8080`, the base
URL is unique per node, and macaroons are credentials to be treated like
passwords.

Self-hosted LND uses the same flow with the `lnd` backend instead of
`voltage-lnd`: env names `LND_SOCKET`, `LND_TLS_CERT`, and `LND_MACAROON`. The
socket must be reachable from Vercel and the TLS certificate must match the host
name clients use.

## 1. Prepare LND credentials

Collect these from your node (the Voltage dashboard, or your own LND):

- `VOLTAGE_LND_BASE_URL`: node API host or URL, for example
  `node-name.m.voltageapp.io` or `https://node-name.m.voltageapp.io`.
- `VOLTAGE_LND_MACAROON`: macaroon as a hex string.
- `VOLTAGE_LND_CERT`: TLS certificate value. Some Voltage HTTP integrations do
  not need a cert, but the adapter env contract still requires the variable.

Export them only in the local shell that runs validation/deploy:

```sh
export VOLTAGE_LND_BASE_URL="<your-voltage-node-host-or-url>"
export VOLTAGE_LND_MACAROON="<hex-macaroon>"
export VOLTAGE_LND_CERT="<certificate-value>"
```

Do not commit these values, paste them into client-side code, or store them in
`NEXT_PUBLIC_*` variables.

## 2. Create or select the proxy config

The CLI saves named configs under `~/.config/boltwall/`. Config files store
non-secret routing metadata and environment variable names only; they do not
store credential values.

To create a config without deploying yet:

```sh
bun run boltwall -- config create
```

Example answers for a Pokedex proxy (substitute your own upstream, price, and
client origin):

| Prompt                                      | Answer                                                              |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Config name                                 | `voltage-pokedex-proxy`                                             |
| Lightning backend                           | `voltage-lnd`                                                       |
| Allow browser JavaScript clients            | `yes` (only if a browser client will read the challenge)            |
| Allowed browser origins                     | the origin that will read the challenge, e.g. `https://your-app.example` |
| Upstream target URL                         | `https://pokeapi.co/api/v2`                                         |
| Default price in millisatoshis              | `1000`                                                             |
| Protected path                              | `/pokemon/*`                                                       |
| Protected path price in millisatoshis       | `1000`                                                             |
| Unprotected paths                           | `/healthz`                                                         |
| Service name for service/capability caveats | press Enter                                                        |
| Credential lifetime in seconds              | press Enter                                                        |
| Origin caveat origins                       | press Enter                                                        |
| Capability caveats to mint                  | press Enter                                                        |
| Use HODL invoices                           | `no`                                                              |

Leave the service/capability prompts blank for a basic proxy. They are for
advanced authorization policy: a service name mints a `services=<name>:0` caveat,
and capabilities mint `<service>_capabilities=...`. The L402 macaroon spec
(§Caveat Format) defines these caveats and (§Verification) the satisfier behavior.

## 3. Validate the proxy config

Validate the named config from the current shell:

```sh
bun run boltwall -- validate --config voltage-pokedex-proxy
```

Expected output: a config summary, a backend capability summary, and no secret
values.

## 4. Deploy the proxy to Vercel

Interactive mode selects or edits a saved config, confirms deploy intent, and
sends missing backend secrets to Vercel as sensitive environment variables:

```sh
bun run boltwall -- deploy --config voltage-pokedex-proxy
```

Automation mode requires all referenced env vars to be present in the current
shell and skips the final confirmation:

```sh
bun run boltwall -- deploy --config voltage-pokedex-proxy --yes
```

For a production deployment:

```sh
bun run boltwall -- deploy --config voltage-pokedex-proxy --prod
```

The CLI shells out to Vercel, creates or updates generated runtime variables,
adds backend secrets as sensitive Vercel env vars, deploys the generated proxy
project, and prints the `Deployment URL`, `Environment`, and `Project directory`.

Record the deployment URL. The protected resource is:

```text
https://<proxy-deployment-url>/pokemon/1
```

First verification:

```sh
curl -i https://<proxy-deployment-url>/pokemon/1
```

Expected: `402 Payment Required`, a dual `WWW-Authenticate` challenge, and no
backend secret material in the response.

## 5. Point your client at the proxy

If a browser client will read the L402 challenge, set its public endpoint
variable to the proxy resource. The playground in this repo reads it at build
time from:

```text
NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT
```

Set that variable on your client's Vercel project to:

```text
https://<proxy-deployment-url>/pokemon/1
```

Because the variable is public and bundled into the browser, it must contain
only the endpoint URL. Never put macaroons, certs, API keys, preimages, or
bearer credentials in `NEXT_PUBLIC_*` variables. Redeploy the client after
changing the variable — use a preview deployment first, then production once
verified:

```sh
vercel deploy
vercel deploy --prod
```

## 6. Browser verification checklist

Open your client and fetch the configured endpoint.

Expected first request:

- status is `402`,
- the challenge field shows `WWW-Authenticate`,
- browser devtools does not show a CORS error.

If the browser cannot read the challenge, configure the proxy deployment to allow
the client origin and expose `WWW-Authenticate`. `curl` seeing the header is not
enough for browser UX; CORS must expose it to client JavaScript.

Pay the invoice with a Lightning wallet or node that can reach your LND node,
then retry with:

```sh
curl -i \
  -H "Authorization: L402 <macaroon>:<payment-preimage>" \
  https://<proxy-deployment-url>/pokemon/1
```

Expected paid retry:

- `200 OK`,
- PokeAPI JSON for Pokemon #1,
- no secret values in browser source, network responses, committed config, or
  Vercel logs.

## Production safety checklist

- The proxy is deployed over HTTPS.
- Vercel env vars holding LND credentials are sensitive variables.
- `NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT` contains only the public proxy
  URL.
- The protected endpoint exposes `WWW-Authenticate` for the client origin.
- The invoice amount matches the configured `priceMsat`.
- Macaroons, preimages, certs, and `.env` files are absent from git status,
  client bundles, screenshots, and logs.

## External docs checked

- Vercel CLI env docs: <https://vercel.com/docs/cli/env>
- Vercel CLI deploy docs: <https://vercel.com/docs/cli/deploy>
- Vercel CLI project deploy guide: <https://vercel.com/docs/projects/deploy-from-cli>
- Voltage LND node API docs: <https://docs.voltage.cloud/lnd-node-api>
