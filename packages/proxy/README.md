# @boltwall/proxy

Express reverse proxy runtime for protecting an upstream HTTP service with
Boltwall L402 payment authentication.

The runtime owns proxy concerns only: route selection, upstream forwarding,
header forwarding policy, and upstream error handling. L402 challenge emission,
credential parsing, invoice creation, macaroon caveats, satisfiers, and payment
verification are delegated to [`@boltwall/middleware`](../middleware/README.md).

> **New to L402?** See the [project README](../../README.md#what-is-l402) for
> what L402 is and how the packages fit together.

## Table of Contents

- [CLI Quick-Start](#cli-quick-start)
- [Programmatic usage](#programmatic-usage)
- [Environment loading](#environment-loading)
- [Configuration reference](#configuration-reference)
- [Security notes](#security-notes)

## CLI Quick-Start

Install the `boltwall` CLI globally and deploy a Vercel-hosted proxy without
cloning this repository:

```sh
bun add --global @boltwall/proxy
boltwall deploy
```

For a local dev server instead of a Vercel deployment:

```sh
boltwall dev
```

**From zero to a paid request:**

1. Run `boltwall deploy` and choose `lnd`, `opennode`, or `btcpay`.
2. Enter the upstream URL — the HTTP service being protected — for example
   `https://pokeapi.co/api/v2`, and protect a path such as `/pokemon/*`.
3. Set a small price, for example `1000` millisatoshis, then provide the backend
   secret values when prompted.
4. Open the deployment URL printed by the CLI, or request a protected resource
   with `curl`. The first protected request returns `402 Payment Required` with
   an L402 challenge — a `WWW-Authenticate` header carrying a macaroon and a
   Lightning invoice. A **macaroon** is the bearer credential token issued to
   the payer (see [What is L402?](../../README.md#what-is-l402)).
5. Pay the invoice with a wallet. Paying it yields a **preimage** — the payment
   secret the Lightning node returns on settlement, which proves the invoice was
   paid. Combine the challenge macaroon with that preimage, then retry the
   protected request with an `Authorization: L402 <macaroon>:<preimage>` header
   and receive the upstream `200` response.

Automation can use a checked-in, non-secret JSON or YAML config:

```sh
boltwall deploy --config ./boltwall.yaml --yes
boltwall validate --config ./boltwall.yaml
boltwall dev --config ./boltwall.yaml
```

`--config` accepts either a saved config name or a filesystem path. `--yes`
skips the final deploy confirmation; it does not skip required config or secret
prompts if values are missing in an interactive shell.

For full repo-level workflows that combine the proxy with local regtest LND,
Vercel, and the playground, start with:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel + Voltage Pokedex deploy](../../docs/vercel-voltage-pokedex-demo.md)

The deploy command shells out to the Vercel CLI, so install and authenticate it
before deployment. The wizard saves non-secret metadata and environment variable
names only; backend credentials, `BOLTWALL_PROXY_ROOT_KEY`, macaroons,
preimages, bearer tokens, TLS certificates, and `.env` files must stay outside
source control.

Generated Vercel projects receive `BOLTWALL_PROXY_ROOT_KEY`, a 32-byte hex
deployment secret used for L402 macaroon root keys. Rotating it invalidates
credentials minted by that proxy, so persist it in deployment secrets if paid
credentials must survive redeploys.

## Programmatic usage

When embedding the proxy in an existing Express app, construct a backend adapter
and root key store explicitly:

```ts
import { createProxy } from "@boltwall/proxy";
import { InMemoryRootKeyStore } from "@boltwall/l402";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";

const backend = new OpenNodeAdapter({ apiKey: process.env.OPENNODE_API_KEY! });
const rootKeyStore = new InMemoryRootKeyStore();

const app = createProxy({
  targetUrl: "https://api.example.com",
  backend,
  rootKeyStore,
  defaultPrice: 1_000n,
  routes: [
    {
      path: "/premium/*",
      methods: ["GET"],
      price: (req) => (req.get("x-tier") === "pro" ? 10_000n : 1_000n),
    },
  ],
  unprotectedPaths: ["/healthz"],
  forwardHeaders: { allow: ["x-request-id", "x-forwarded-*"] },
  cors: { allowOrigins: ["https://playground.example.com"] },
});
```

`createProxy` returns an Express app. Mount it directly, or compose it inside a
larger Express server. `InMemoryRootKeyStore` holds root keys in process memory
and has no per-credential revocation; rotate the deployment root key and restart
or redeploy to invalidate credentials.

## Environment loading

Use `loadProxyEnv()` for typed, secret-safe loading of deploy-time proxy
settings:

```ts
import { createProxy, loadProxyEnv } from "@boltwall/proxy";
import { InMemoryRootKeyStore } from "@boltwall/l402";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";

const envConfig = loadProxyEnv({ envFile: ".env.local" });
const backend = new OpenNodeAdapter({ apiKey: process.env.OPENNODE_API_KEY! });
const rootKeyStore = new InMemoryRootKeyStore();

const app = createProxy({ ...envConfig, backend, rootKeyStore });
```

Exported environment variables override values from an optional env file. The
loader reports variable names and validation reasons without echoing values. See
the generated docs for `loadProxyEnv`, `ProxyEnvConfig`, and
`LoadProxyEnvOptions`.

## Configuration reference

The CLI supports JSON or YAML config files:

```yaml
name: pokedex-proxy
targetUrl: https://pokeapi.co/api/v2
backend:
  kind: opennode
  env:
    apiKey: OPENNODE_API_KEY
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
  deny: [cookie, authorization]
cors:
  allowOrigins:
    - https://boltwall-suite-playground.vercel.app
  allowMethods: [GET, OPTIONS]
  allowHeaders: [Authorization, Content-Type]
  maxAgeSeconds: 600
deploy:
  target: vercel
  projectName: boltwall-pokedex-proxy
```

Reference detail for runtime config lives in the generated API docs:

- `ProxyConfig` for target URL, pricing, backend, root-key store, CORS, header
  forwarding, compatibility mode, and upstream timeout behavior.
- `ProxyRoute` for route path, method, price, and route caveat matching.
- `ForwardHeadersPolicy` for upstream header allow/deny matching and credential
  stripping.
- `loadProxyEnv` / `ProxyEnvConfig` for environment variable loading.

Supported CLI backend kinds are `lnd`, `opennode`, and `btcpay`. Config files
store environment variable names for backend credentials, not credential values.
If no custom `backend.env` names are provided, Boltwall uses the provider
defaults documented by the CLI prompts and validation output.

Use this helper when a frontend origin is added after the first deployment:

```sh
boltwall config allow-origin <name-or-path> <origin> [<origin>...]
```

It updates a saved config's CORS allowlist and prints the result for
confirmation. Run `boltwall deploy` again to push the change to Vercel.

## Security notes

- Browser CORS is disabled by default. Configure `cors.allowOrigins` only for
  trusted browser origins that need to read L402 challenges.
- Protected upstream requests strip `Authorization`, `Proxy-Authorization`, and
  `Cookie` headers by default before forwarding. Use `forwardHeaders.allow` and
  `forwardHeaders.deny` to narrow or extend forwarding policy.
- Missing credentials return the default dual challenge shape from
  `@boltwall/middleware`: `LSAT` first, then `L402`, per the
  [L402 protocol specification §10](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md#10-lsat-compatibility).
- Paid retries accept either `Authorization: L402 <macaroon>:<preimage>` or the
  legacy `Authorization: LSAT <macaroon>:<preimage>` form.
- A request that matches no route and has no `defaultPrice` returns
  `404 Not Found` instead of a `402` challenge because there is no price to
  charge.
- Upstream timeouts and upstream `5xx` responses are converted to redacted
  `502` JSON responses.

Do not put backend credentials, macaroons, API keys, TLS certificates,
preimages, bearer tokens, or `.env` files in client-side code or committed
config. Deploy-time secrets belong in the current shell, interactive secret
prompts, or deployment environment variables.
