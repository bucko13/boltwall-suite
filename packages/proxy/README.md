# @boltwall/proxy

Express reverse proxy runtime for protecting an upstream HTTP service with
Boltwall L402 payment authentication.

The runtime owns proxy concerns only: route selection, upstream forwarding,
header forwarding policy, and upstream error handling. L402 challenge emission,
credential parsing, invoice creation, macaroon caveats, satisfiers, and payment
verification are delegated to `@boltwall/middleware`.

## Usage

For Vercel deployments, use the CLI. It creates or reuses a saved config under
`~/.config/boltwall/`, validates it, sets the required Vercel environment
variables, and deploys the generated proxy project:

```sh
boltwall deploy vercel
```

Automation can use a checked-in non-secret config:

```sh
boltwall deploy vercel --config ./boltwall.yaml --yes
boltwall validate --config ./boltwall.yaml
boltwall dev --config ./boltwall.yaml
```

Saved configs store metadata and environment variable names only. Backend
credentials are read from the current process or prompted interactively, then
sent to Vercel with `vercel env add --sensitive`; they are not written to the
config file.

Programmatic usage is still available when embedding the proxy in an existing
Express app:

```ts
import { createProxy } from "@boltwall/proxy";

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
});
```

`createProxy` returns an Express app. Mount it directly, or compose it inside a
larger Express server.

## Environment loading

Use `loadProxyEnv()` for typed, secret-safe loading of deploy-time proxy
settings:

```ts
import { createProxy, loadProxyEnv } from "@boltwall/proxy";

const envConfig = loadProxyEnv({ envFile: ".env.local" });

const app = createProxy({
  ...envConfig,
  backend,
  rootKeyStore,
});
```

Supported variables:

- `BOLTWALL_PROXY_TARGET_URL` (required)
- `BOLTWALL_PROXY_SERVICE`
- `BOLTWALL_PROXY_DEFAULT_PRICE_MSAT`
- `BOLTWALL_PROXY_UNPROTECTED_PATHS`
- `BOLTWALL_PROXY_FORWARD_ALLOW`
- `BOLTWALL_PROXY_FORWARD_DENY`
- `BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS`
- `BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY`

Exported environment variables override values from an optional env file. The
loader reports variable names and validation reasons without echoing values.

## CLI config

`boltwall deploy vercel` can create this shape interactively:

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
deploy:
  target: vercel
  projectName: boltwall-pokedex-proxy
```

Supported backend kinds are `lnd`, `voltage-lnd`, `opennode`, and `btcpay`.
`boltwall validate` constructs the selected adapter, verifies required env vars,
and checks backend capability flags before serving traffic.

## Compatibility behavior

- Missing credentials return `402 Payment Required` with the default dual
  challenge shape from `@boltwall/middleware`: `LSAT` first, then `L402`, per
  `L402 protocol-specification.md §10`.
- Paid retries accept either `Authorization: L402 <macaroon>:<preimage>` or the
  legacy `Authorization: LSAT <macaroon>:<preimage>` form.
- Route prices can be static millisatoshis or resolved per Express request.
- Route caveats can be static or resolved per Express request.
- Middleware behaviors used by the legacy proxy flow remain available through
  proxy config: `rate`, `capabilities`, `invoiceMemo`, `satisfiers`, `onPaid`,
  and backend capability requirements such as `hodl`.
- Unprotected paths bypass L402 and header sanitization, so they proxy through
  as normal upstream requests.
- For protected paths, authorization credentials, proxy credentials, and cookies
  are stripped before forwarding by default. Use `forwardHeaders.allow` and
  `forwardHeaders.deny` for additional forwarding policy.
- Upstream timeouts and upstream 5xx responses are converted to a redacted
  `502` JSON response.

The implementation is re-built around the L402 specs and the local middleware
package. It does not copy source code, comments, tests, or generated docs from
the AGPL legacy Boltwall implementation.
