# @boltwall/proxy

Express reverse proxy runtime for protecting an upstream HTTP service with
Boltwall L402 payment authentication.

The runtime owns proxy concerns only: route selection, upstream forwarding,
header forwarding policy, and upstream error handling. L402 challenge emission,
credential parsing, invoice creation, macaroon caveats, satisfiers, and payment
verification are delegated to `@boltwall/middleware`.

## CLI Quick-Start

For no-code Vercel deployments, use the installable `boltwall` CLI. It creates
or reuses a saved config under `~/.config/boltwall/`, validates the config,
maps backend credentials to Vercel environment variables, and deploys a
generated proxy project from package-owned code.

Install the package without cloning this repository:

```sh
bun add --global @boltwall/proxy
boltwall --help
```

Make sure the Vercel CLI is available in `PATH` and authenticated before
deploying. `boltwall deploy` checks this first, before loading or creating proxy
config, and asks you to install the CLI or run `vercel login` if the preflight
fails. When backend secrets are missing, `boltwall deploy` prompts for them with
hidden input, rejects blank values, and sends them to Vercel with
`vercel env add --sensitive`. After preflight, it shells out to `vercel env add`
and `vercel deploy`.

Start the interactive deployment flow:

```sh
boltwall deploy
```

The wizard asks for the upstream URL, protected path, Lightning backend, price,
browser CORS policy when needed, advanced paywall policy (credential
expiration, origin caveat, capability caveats, and HODL invoice mode), and
Vercel project name. Select prompts show numbered choices with the default
marked, and secret prompts mask terminal echo.
The wizard saves non-secret metadata and environment variable names only. If a
required backend secret is not already present in the current process, the
wizard prompts for it and sends it to Vercel with `vercel env add --sensitive`;
it does not silently write secret values to disk.

Automation can use a checked-in, non-secret JSON or YAML config:

```sh
boltwall deploy --config ./boltwall.yaml --yes
boltwall validate --config ./boltwall.yaml
boltwall dev --config ./boltwall.yaml
```

`--config` accepts either a saved config name or a filesystem path. `--yes`
skips the final deploy confirmation; it does not skip required config or secret
prompts if values are missing in an interactive shell.

From zero to a paid request:

1. Run `boltwall deploy` and choose `lnd`, `voltage-lnd`, `opennode`, or
   `btcpay`.
2. Enter the upstream API, for example `https://pokeapi.co/api/v2`, and protect
   a path such as `/pokemon/*`.
3. Set a small price, for example `1000` millisatoshis, then provide the backend
   secret values when prompted.
4. Open the deployment URL printed by the CLI, or request a protected resource
   with `curl`. The first protected request returns `402 Payment Required` with
   L402/LSAT challenges.
5. Pay the invoice with a wallet, combine the challenge macaroon with the
   resulting preimage, then retry the protected request with an L402/LSAT
   `Authorization` header and receive the upstream `200` response.

For full repo-level workflows that combine the proxy with local regtest LND,
Voltage, Vercel, and the playground, start with:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)

Direct Vercel Deploy Button templates are not the v1 primary path. Boltwall
needs backend-specific prompting, secret redaction, config validation, and
Vercel environment setup that static template prompts cannot express cleanly.

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
  cors: {
    allowOrigins: ["https://playground.example.com"],
  },
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
- `BOLTWALL_PROXY_CORS_ALLOW_ORIGINS`
- `BOLTWALL_PROXY_CORS_EXPOSE_HEADERS`
- `BOLTWALL_PROXY_CORS_ALLOW_HEADERS`
- `BOLTWALL_PROXY_CORS_ALLOW_METHODS`
- `BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS`
- `BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS`
- `BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY`
- `BOLTWALL_PROXY_POLICY_VALID_UNTIL`
- `BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS`
- `BOLTWALL_PROXY_POLICY_ORIGIN`
- `BOLTWALL_PROXY_CAPABILITIES`
- `BOLTWALL_PROXY_PAYWALL_HODL`

Exported environment variables override values from an optional env file. The
loader reports variable names and validation reasons without echoing values.

## CLI Config

`boltwall config create`, `boltwall dev`, and `boltwall deploy` start with a
basic reverse-proxy wizard. That path asks for backend, browser access, target
URL, protected routes, prices, and unprotected paths. It creates this YAML shape
without requiring L402 caveat terminology:

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

The same config may be written as JSON:

```json
{
  "name": "pokedex-proxy",
  "targetUrl": "https://pokeapi.co/api/v2",
  "backend": {
    "kind": "opennode",
    "env": {
      "apiKey": "OPENNODE_API_KEY"
    }
  },
  "pricing": {
    "defaultPriceMsat": "1000"
  },
  "routes": [
    {
      "path": "/pokemon/*",
      "methods": ["GET"],
      "priceMsat": "1000"
    }
  ],
  "challengeCompatibility": "dual",
  "forwardHeaders": {
    "allow": ["accept", "content-type", "x-request-id"],
    "deny": ["cookie", "authorization"]
  },
  "cors": {
    "allowOrigins": ["https://boltwall-suite-playground.vercel.app"],
    "allowMethods": ["GET", "OPTIONS"],
    "allowHeaders": ["Authorization", "Content-Type"],
    "maxAgeSeconds": 600
  },
  "deploy": {
    "target": "vercel",
    "projectName": "boltwall-pokedex-proxy"
  }
}
```

Saved configs live under `~/.config/boltwall/` by default. The interactive
deploy command lets you use an existing config, edit one, or create a new one
when multiple saved configs exist. `boltwall config list` prints saved config
names and paths, and `boltwall config show <name-or-path>` prints the path plus
a compact config summary without expanding credential environment variables.

Supported backend kinds are `lnd`, `voltage-lnd`, `opennode`, and `btcpay`.
`boltwall validate` constructs the selected adapter, verifies required env vars,
and checks backend capability flags. `boltwall dev` and `boltwall deploy` run
the same validation before starting a local server or writing Vercel state.

### Backend Secret References

Configs store the names of environment variables that contain backend
credentials. They do not store credential values. If no custom `backend.env`
names are provided, Boltwall uses these defaults:

| Backend       | Required variables                                                 | Optional variables                                                        |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `lnd`         | `LND_SOCKET`, `LND_TLS_CERT`, `LND_MACAROON`                       | none                                                                      |
| `voltage-lnd` | `VOLTAGE_LND_BASE_URL`, `VOLTAGE_LND_CERT`, `VOLTAGE_LND_MACAROON` | none                                                                      |
| `opennode`    | `OPENNODE_API_KEY`                                                 | `OPENNODE_BASE_URL`                                                       |
| `btcpay`      | `BTCPAY_BASE_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`             | `BTCPAY_CRYPTO_CODE`, `BTCPAY_HODL_INVOICES`, `BTCPAY_STREAMING_INVOICES` |

For local LND, `LND_TLS_CERT` is certificate content, not a path; the local
regtest helper emits base64, and PEM may also be accepted by the underlying
`lightning` package. `LND_MACAROON` is local LND macaroon content; the local
regtest helper emits base64. Path-based tools should use explicit path names
such as `LND_TLS_CERT_PATH`.

During `boltwall deploy`, config values become generated runtime
environment variables such as `TARGET_URL`, `LN_BACKEND`,
`DEFAULT_PRICE_MSAT`, `CHALLENGE_COMPATIBILITY`, `UNPROTECTED_PATHS`,
`FORWARD_ALLOW`, `FORWARD_DENY`, `CORS_ALLOW_ORIGINS`,
`CORS_EXPOSE_HEADERS`, `CORS_ALLOW_HEADERS`, `CORS_ALLOW_METHODS`,
`CORS_MAX_AGE_SECONDS`, `UPSTREAM_TIMEOUT_MS`, `POLICY_VALID_UNTIL`,
`POLICY_VALID_UNTIL_SECONDS`, `POLICY_ORIGIN`, `CAPABILITIES`, and
`PAYWALL_HODL`. When `cors` is configured, the runtime allows only the listed
exact origins and exposes `WWW-Authenticate` by default so browser clients can
read L402 challenges. `POLICY_ORIGIN` is separate from CORS: it binds minted
credentials to request `Origin` headers using an `origin=<origins>` macaroon
caveat. Backend secret references map to the canonical Vercel-side names above.
For example, a local config may read `MY_OPENNODE_SECRET`, while the deployed
project receives `OPENNODE_API_KEY`.

### Paywall Policy

The optional `policy` object is the deployment-facing surface for common
macaroon and paywall controls:

| Key                 | Effect                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| `validUntil`        | Adds a fixed `valid-until=<ISO-8601>` caveat to minted macaroons.        |
| `validUntilSeconds` | Adds a fresh relative `valid-until` caveat for each challenge.           |
| `origin`            | Adds an `origin=<origins>` caveat and verifies request `Origin` headers. |
| `capabilities`      | Adds service-specific capability caveats; requires `service`.            |
| `hodl`              | Uses HODL invoices and requires a backend with HODL support.             |
| `requires`          | Declares backend capability requirements without changing paywall mode.  |

`validUntil` and `validUntilSeconds` automatically register the matching
`valid-until` satisfier, so paid retries with expired credentials return `401`.
Per-route `requires` still works and is combined with global policy
requirements during validation.

The interactive wizard asks `Configure advanced credential policy` after the
basic proxy questions. The default answer is no for new configs. Answer yes only
when you want to add credential expiration, bind credentials to browser
`Origin` headers, use HODL invoices, or scope credentials to named
services/capabilities. Service/capability scoping is behind a second prompt,
`Scope credentials to named capabilities`, because normal reverse-proxy payment
does not need a service scope.

Normal reverse-proxy payment does not need a `service` field, a `services`
caveat, or capability caveats. Add them only when a credential should be scoped
to named services or service-specific operations. L402 macaroon-spec.md
§Caveat Format defines `services=<name>:<tier>` and
`<service>_capabilities=<capability,...>` caveats; §Verification defines their
attenuation and satisfier behavior.

Advanced service/capability policy example:

```yaml
service: pokedex
policy:
  validUntilSeconds: 60
  origin:
    - https://boltwall-suite-playground.vercel.app
  capabilities: [pokedex-read]
```

Do not put backend credentials, macaroons, API keys, TLS certificates,
preimages, bearer tokens, or `.env` files in client-side code or committed
config. Deploy-time secrets belong in the current shell, interactive secret
prompts, or Vercel environment variables.

### Validation And Redaction

Config loading uses the same zod-backed validation path for `deploy`, `dev`,
and `validate`. Invalid JSON/YAML, malformed URLs, unsupported backend kinds,
bad millisatoshi strings, missing env vars, or unsupported backend capabilities
fail before the proxy starts serving traffic.

Validation and deployment errors are designed to be actionable without echoing
secret values. They name the missing or malformed variable and redact long
credential-like output from failed Vercel commands.

## Compatibility behavior

- Missing credentials return `402 Payment Required` with the default dual
  challenge shape from `@boltwall/middleware`: `LSAT` first, then `L402`, per
  `L402 protocol-specification.md §10`.
- Paid retries accept either `Authorization: L402 <macaroon>:<preimage>` or the
  legacy `Authorization: LSAT <macaroon>:<preimage>` form.
- Route prices can be static millisatoshis or resolved per Express request.
- Route caveats can be static or resolved per Express request.
- Browser CORS is disabled by default. When `cors.allowOrigins` is configured,
  matching origins receive `Access-Control-Allow-Origin`,
  `Access-Control-Expose-Headers: WWW-Authenticate`, and preflight responses
  for the configured methods and headers.
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
