# Deploy an L402 proxy to Vercel (Voltage-hosted LND node)

This runbook deploys an `@boltwall/proxy` in front of an existing HTTP API on
Vercel, backed by an LND node hosted on [Voltage](https://voltageapp.io), and
walks the full challenge → pay → retry path. A Voltage node is a plain LND node,
so it is consumed through the standard `lnd` backend; Voltage is the primary
example because it gives you a hosted LND endpoint reachable from Vercel.
Self-hosted LND works exactly the same way — same backend, same env vars.

The example protects the public PokeAPI (`https://pokeapi.co/api/v2`) so you can
follow it end to end, but every value here is yours to change.

## Prerequisites

[Voltage](https://voltageapp.io) is a hosted LND provider: it runs the Lightning
node for you and exposes a gRPC endpoint and macaroon you can reach from Vercel.
Its gRPC endpoint is served with a publicly-trusted TLS certificate, so — unlike
a self-hosted node with a self-signed cert — you do **not** supply a TLS cert.

- Bun installed.
- Vercel CLI installed and authenticated (`vercel login`).
- A running LND node with inbound liquidity to receive test payments, and a
  macaroon permitted to create and look up invoices. With Voltage, the gRPC
  host and admin macaroon come from the Voltage dashboard.
- A local checkout of this repository if you are deploying the workspace
  `@boltwall/proxy` from source.

References: [Vercel CLI deploy](https://vercel.com/docs/cli/deploy) — stdout is
the deployment URL, `--prod` deploys to production, and `vercel env add NAME
--sensitive` stores a value with hidden contents. [Voltage LND node
API](https://docs.voltage.cloud/lnd-node-api) — the node host is unique per node
and macaroons are credentials to be treated like passwords.

## 1. Prepare LND credentials

The `lnd` backend (`LN_BACKEND=lnd`) reads these env vars. Collect their values
from your node — the Voltage dashboard, or your own LND:

- `LND_SOCKET` (required): the gRPC endpoint as `host:port`. For a Voltage node
  this is `<node-name>.m.voltageapp.io:10009`. Use the **gRPC host on port
  `10009`** with no scheme, not the dashboard's REST URL (port `8080`) — the
  adapter speaks gRPC, and pointing it at `https://…:8080` fails to connect.
- `LND_MACAROON` (required): the admin macaroon content (base64 or hex). Copy it
  from the Voltage dashboard.
- `LND_TLS_CERT` (optional): the node's TLS certificate, as a PEM or its base64
  encoding (a raw PEM is normalized automatically). **Omit it for Voltage** — and
  any node served with a publicly-trusted certificate — so the gRPC client
  verifies the connection against the system CA store. Supplying a custom cert
  there makes it the *only* trusted CA and the handshake fails with
  `unable to get issuer certificate`. Set it **only** for a self-hosted node with
  a self-signed cert, where it is used as the gRPC CA.

Export them only in the local shell that runs validation/deploy. For Voltage,
leave `LND_TLS_CERT` unset:

```sh
export LND_SOCKET="<node-name>.m.voltageapp.io:10009"
export LND_MACAROON="<base64-macaroon>"
# Voltage: do NOT set LND_TLS_CERT (publicly-trusted cert → system CA store).
# Self-hosted with a self-signed cert only:
# export LND_TLS_CERT="$(cat /path/to/tls.cert)"
```

> **Vercel keeps environment variables across deploys.** A value set on a
> previous deploy stays until you overwrite or delete it — omitting it from your
> shell does not remove it. If you switch a node from a self-signed cert to a
> managed (no-cert) node, delete the old value or the function keeps using it:
> `vercel env rm LND_TLS_CERT production` (and `preview`), or remove it in the
> Vercel dashboard. The same applies to any rotated credential.

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

| Prompt                                | Answer                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Config name                           | `voltage-pokedex-proxy`                                                  |
| Lightning backend                     | `lnd`                                                                    |
| Allow browser JavaScript clients      | `yes` (only if a browser client will read the challenge)                 |
| Allowed browser origins               | the origin that will read the challenge, e.g. `https://your-app.example` |
| Upstream target URL                   | `https://pokeapi.co/api/v2`                                              |
| Default price in millisatoshis        | `1000`                                                                   |
| Protected path                        | `/pokemon/*`                                                             |
| Protected path price in millisatoshis | `1000`                                                                   |
| Unprotected paths                     | `/healthz`                                                               |
| Use HODL invoices                     | `no`                                                                     |

Leave the service, capability, lifetime, and origin-caveat prompts empty for a basic proxy.

See [the local regtest workflow](./local-regtest-proxy-playground.md) for the advanced service/capability caveat options.

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
