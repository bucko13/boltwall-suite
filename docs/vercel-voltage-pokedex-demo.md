# Vercel Voltage Pokedex Demo

This runbook deploys a production-style Boltwall proxy to Vercel, backed by a
Voltage LND node, then points the hosted playground at the protected PokeAPI
resource.

The intended production playground is:

```text
https://boltwall-suite-playground.vercel.app/
```

The generated proxy config below opts into CORS for the hosted playground origin
and exposes `WWW-Authenticate`, which lets the browser Demo panel read the L402
challenge from the cross-origin proxy response.

## Roles And Prerequisites

Owner/admin prerequisites:

- Access to the Vercel team/project that owns the proxy deployment.
- Access to the Vercel project that deploys the playground.
- A running Voltage LND node with inbound liquidity sufficient to receive test
  payments.
- Permission to retrieve or create a macaroon for invoice creation and lookup.

Developer prerequisites:

- Bun installed.
- Vercel CLI installed and authenticated.
- Local checkout of this repository if you are deploying the current workspace
  package before publication.

Vercel CLI reference:

- Vercel's CLI deploy docs state that `vercel`/`vercel deploy` deploys a
  project and that stdout is the deployment URL.
- `vercel --prod` creates a production deployment.
- `vercel env add NAME --sensitive` stores sensitive env vars with hidden
  values.

Voltage LND reference:

- Voltage exposes full LND API access for hosted LND nodes.
- The node API base URL is unique per node and is visible in the Voltage
  dashboard.
- The gRPC port is `10009`; REST is `8080`.
- Macaroons are authentication tokens and must be treated like passwords.

## 1. Prepare Voltage Credentials

Collect these values from the Voltage dashboard:

- `VOLTAGE_LND_BASE_URL`: node API host or URL, for example
  `node-name.m.voltageapp.io` or `https://node-name.m.voltageapp.io`.
- `VOLTAGE_LND_MACAROON`: macaroon as a hex string.
- `VOLTAGE_LND_CERT`: TLS certificate value required by the adapter. Some
  Voltage HTTP integrations do not need a cert, but this Boltwall adapter env
  contract still requires the variable.

Export them only in the local shell that runs validation/deploy:

```sh
export VOLTAGE_LND_BASE_URL="<your-voltage-node-host-or-url>"
export VOLTAGE_LND_MACAROON="<hex-macaroon>"
export VOLTAGE_LND_CERT="<certificate-value>"
```

Do not commit these values, paste them into client-side code, or store them in
`NEXT_PUBLIC_*` variables.

## 2. Create The Proxy Config

Create `boltwall.voltage.yaml` locally. It is safe to commit only if it contains
no credential values; the example below stores env var names only.

```yaml
name: voltage-pokedex-proxy
targetUrl: https://pokeapi.co/api/v2
service: pokedex
backend:
  kind: voltage-lnd
  env:
    baseUrl: VOLTAGE_LND_BASE_URL
    macaroon: VOLTAGE_LND_MACAROON
    cert: VOLTAGE_LND_CERT
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
    - https://boltwall-suite-playground.vercel.app
  allowMethods: [GET, OPTIONS]
  allowHeaders: [Authorization, Content-Type]
  maxAgeSeconds: 600
upstreamTimeoutMs: 10000
deploy:
  target: vercel
  projectName: boltwall-pokedex-proxy
  production: false
```

`production: false` creates a preview deployment. Change it to `true` or pass
`--prod`/`--production` only when the proxy is ready to be the production target.

## 3. Validate The Proxy Config

When using the local workspace package before publication, build the proxy CLI:

```sh
bun run --cwd packages/proxy build
bun packages/proxy/dist/cli.js validate --config ./boltwall.voltage.yaml
```

After publication, the installed CLI path is:

```sh
bun add --global @boltwall/proxy
boltwall validate --config ./boltwall.voltage.yaml
```

Expected output:

- config summary,
- backend capability summary,
- no secret values.

## 4. Deploy The Proxy To Vercel

Interactive mode can collect missing secrets and send them to Vercel:

```sh
boltwall deploy vercel --config ./boltwall.voltage.yaml
```

Automation mode requires all referenced env vars to be present in the current
shell:

```sh
boltwall deploy vercel --config ./boltwall.voltage.yaml --yes
```

For a production deployment:

```sh
boltwall deploy vercel --config ./boltwall.voltage.yaml --yes --prod
```

The CLI shells out to Vercel, creates or updates generated runtime variables,
adds backend secrets as sensitive Vercel env vars, deploys the generated proxy
project, and prints:

- `Deployment URL`
- `Environment`
- `Project directory`

Record the deployment URL. The protected resource is:

```text
https://<proxy-deployment-url>/pokemon/1
```

First verification:

```sh
curl -i https://<proxy-deployment-url>/pokemon/1
```

Expected result:

- `402 Payment Required`,
- a dual `WWW-Authenticate` challenge,
- no backend secret material in the response.

## 5. Configure The Hosted Playground

The playground reads its protected endpoint at build time from:

```text
NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT
```

Set that variable on the Vercel playground project to the proxy resource:

```text
https://<proxy-deployment-url>/pokemon/1
```

Because the variable is public and bundled into the browser, it must contain
only the endpoint URL. Never put Voltage macaroons, certs, API keys, preimages,
or bearer credentials in `NEXT_PUBLIC_*` variables.

Redeploy the playground after changing the env var. Use a preview deployment
first, then production when verified:

```sh
vercel deploy
vercel deploy --prod
```

If using the live project at
`https://boltwall-suite-playground.vercel.app/`, an owner/admin must perform or
approve the production environment update and redeploy.

## 6. Browser Verification Checklist

Open the playground Demo panel and fetch the configured endpoint.

Expected first request:

- status is `402`,
- the challenge field shows `WWW-Authenticate`,
- browser devtools does not show a CORS error.

If the browser cannot read the challenge, configure the proxy deployment to
allow the playground origin and expose `WWW-Authenticate`. `curl` seeing the
header is not enough for browser UX; CORS must expose it to client JavaScript.

Pay the invoice with a Lightning wallet or node that can reach the Voltage LND
node. Then retry with:

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

## Production Safety Checklist

- The proxy is deployed over HTTPS.
- Vercel env vars holding Voltage credentials are sensitive variables.
- `NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT` contains only the public proxy
  URL.
- The protected endpoint exposes `WWW-Authenticate` for the playground origin.
- The invoice amount matches the configured `priceMsat`.
- Macaroons, preimages, certs, and `.env` files are absent from git status,
  client bundles, screenshots, and logs.

## External Docs Checked

- Vercel CLI env docs: <https://vercel.com/docs/cli/env>
- Vercel CLI deploy docs: <https://vercel.com/docs/cli/deploy>
- Vercel CLI project deploy guide:
  <https://vercel.com/docs/projects/deploy-from-cli>
- Voltage LND node API docs: <https://docs.voltage.cloud/lnd-node-api>
