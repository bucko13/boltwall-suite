# @boltwall/proxy

Express reverse proxy runtime for protecting an upstream HTTP service with
Boltwall L402 payment authentication.

The runtime owns proxy concerns only: route selection, upstream forwarding,
header forwarding policy, and upstream error handling. L402 challenge emission,
credential parsing, invoice creation, macaroon caveats, satisfiers, and payment
verification are delegated to `@boltwall/middleware`.

> **New to L402?** See the [project README](../../README.md#what-is-l402) for
> what L402 is and how the packages fit together.

## Table of Contents

- [CLI Quick-Start](#cli-quick-start)
- [How deploy works](#how-deploy-works)
- [Programmatic usage](#programmatic-usage)
- [Environment loading](#environment-loading)
- [CLI Config](#cli-config)
  - [Choosing a backend](#choosing-a-backend)
  - [Backend Secret References](#backend-secret-references)
  - [Paywall Policy](#paywall-policy)
  - [Validation And Redaction](#validation-and-redaction)
- [Compatibility behavior](#compatibility-behavior)

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

1. Run `boltwall deploy` and choose `lnd`, `voltage-lnd`, `opennode`, or
   `btcpay`.
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
Voltage, Vercel, and the playground, start with:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)

### How deploy works

> **Prerequisites:** `boltwall deploy` shells out to the Vercel CLI, so install
> it and sign in (`npm i -g vercel` then `vercel login`) before running the
> deploy command. The preflight check below fails fast if the CLI is missing or
> unauthenticated.

`boltwall deploy` runs a preflight check to confirm the Vercel CLI is available
and authenticated, then loads or creates a saved config under
`~/.config/boltwall/`. It maps backend credentials to Vercel environment
variables, links the generated project directory with `vercel link`, writes
secrets with `vercel env add --sensitive`, and calls `vercel deploy`. The
wizard saves non-secret metadata and environment variable names only; it never
writes secret values to disk.

Generated Vercel projects also receive `BOLTWALL_PROXY_ROOT_KEY`, a 32-byte hex
deployment secret used to derive per-token L402 macaroon root keys. If the
variable is present in the current environment, `boltwall deploy` sends that
value to Vercel as a sensitive env var. If absent, the CLI generates a new
secret for the deployment.

Generated Vercel projects pin their `@boltwall/*` dependencies to the installed
`@boltwall/proxy` version, not to `latest`.

> **Root key rotation:** rotating `BOLTWALL_PROXY_ROOT_KEY` and redeploying
> invalidates all credentials minted by that proxy. Persist the key outside
> source control if existing paid credentials must continue to verify.

### `boltwall config allow-origin`

```sh
boltwall config allow-origin <name-or-path> <origin> [<origin>...]
```

Adds one or more browser origins to the saved config's CORS allowlist without
re-running the full deploy wizard. Use this when you add a new frontend domain
after the initial deploy. The updated config is printed for confirmation; run
`boltwall deploy` again to push the change to Vercel.

## Programmatic usage

When embedding the proxy in an existing Express app, construct a backend adapter
and root key store explicitly:

> **Note:** `InMemoryRootKeyStore` holds root keys in process memory and does
> not support per-credential revocation. To invalidate credentials you must
> rotate the deployment root key and restart/redeploy the proxy (see below).

```ts
import { createProxy } from "@boltwall/proxy";
import { InMemoryRootKeyStore } from "@boltwall/l402";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";

const backend = new OpenNodeAdapter({ apiKey: process.env.OPENNODE_API_KEY! });
// No per-credential revocation: invalidating credentials requires rotating
// the root key and restarting/redeploying. See the note above.
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
  cors: {
    allowOrigins: ["https://playground.example.com"],
  },
});
```

`InMemoryRootKeyStore` holds root keys in process memory. It does not support
per-credential revocation; to invalidate credentials, rotate
`BOLTWALL_PROXY_ROOT_KEY` and redeploy. For other backends, import from
`@boltwall/adapters/lnd`, `@boltwall/adapters/voltage-lnd`, or
`@boltwall/adapters/btcpay`.

`createProxy` returns an Express app. Mount it directly, or compose it inside a
larger Express server.

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

Wildcards work differently on the two config surfaces. Route `path` values
honor a `*` only as a trailing prefix (for example `/pokemon/*`); every other
string matches literally, and programmatic routes can pass a `RegExp` for
segment-level matching. `forwardHeaders.allow` and `forwardHeaders.deny`
patterns are case-insensitive globs where `*` is a wildcard that can appear
anywhere (for example `x-forwarded-*`, `*-token`, or `x-*-id`).

Saved configs live under `~/.config/boltwall/` by default. The interactive
deploy command lets you use an existing config, edit one, or create a new one
when multiple saved configs exist. `boltwall config list` prints saved config
names and paths, and `boltwall config show <name-or-path>` prints the path plus
a compact config summary without expanding credential environment variables.

Supported backend kinds are `lnd`, `voltage-lnd`, `opennode`, and `btcpay`.
`boltwall validate` constructs the selected adapter, verifies required env vars,
and checks backend capability flags. `boltwall dev` and `boltwall deploy` run
the same validation before starting a local server or writing Vercel state.

### Choosing a backend

| Backend       | Hosting               | You need                                              | Pick it when                                                                  |
| ------------- | --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `lnd`         | Self-hosted           | A reachable LND node, its TLS cert, and a macaroon    | You run your own LND and want direct gRPC/socket access to it.                |
| `voltage-lnd` | Managed LND (Voltage) | A Voltage node's REST URL, TLS cert, and macaroon     | You want your own LND without operating the host — Voltage runs the node.     |
| `opennode`    | Managed (custodial)   | An OpenNode API key                                   | You want the fastest start and are fine with a custodial provider holding funds. |
| `btcpay`      | Self-hosted (BTCPay)  | A BTCPay Server URL, API key, and store ID            | You already run BTCPay, or want a self-hosted, non-custodial gateway with a UI. |

Rules of thumb: choose `opennode` for the least operational work, `voltage-lnd`
to keep your own node without running the host, and `lnd` or `btcpay` when you
self-host. `lnd`, `voltage-lnd`, and `btcpay` are non-custodial (you hold the
funds); `opennode` is custodial. HODL invoices require a backend that supports
them — see the capability flags in [Backend Secret References](#backend-secret-references)
and [Paywall Policy](#paywall-policy).

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

`boltwall deploy` generates the Vercel runtime environment variables from the saved config; backend secret references map to canonical Vercel-side names (e.g. a local `MY_OPENNODE_SECRET` becomes `OPENNODE_API_KEY` on the deployed project).

### Paywall Policy

The optional `policy` object is the deployment-facing surface for common
macaroon and paywall controls. A **macaroon** is the bearer credential token
issued to the payer; **caveats** are conditions baked into it; a **satisfier**
is the server-side verifier for a given caveat type. A **HODL invoice** is a
Lightning payment held in-flight by the node until the server explicitly settles
it, allowing the server to confirm some condition before releasing the funds.

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
- A request that matches no route and has no `defaultPrice` to fall back on
  returns `404 Not Found` rather than a `402` challenge. There is no price to
  charge and no challenge to emit. Configure a catch-all route or a
  `defaultPrice` so unmatched paths are protected and billed.
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

