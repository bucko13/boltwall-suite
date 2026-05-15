# @boltwall/proxy

Express reverse proxy runtime for protecting an upstream HTTP service with
Boltwall L402 payment authentication.

The runtime owns proxy concerns only: route selection, upstream forwarding,
header forwarding policy, and upstream error handling. L402 challenge emission,
credential parsing, invoice creation, macaroon caveats, satisfiers, and payment
verification are delegated to `@boltwall/middleware`.

## Usage

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
