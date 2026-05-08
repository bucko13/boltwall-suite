# @boltwall/proxy

Published runtime and CLI scaffold for Boltwall Suite proxy deployment.

This package will grow into the Express-based reverse proxy that fronts an
upstream service, applies L402 middleware, and exposes a `boltwall` CLI for
local development and configuration validation.

Current scaffold contents:

- runtime entrypoint stub in `src/index.ts`
- CLI entrypoint stub in `src/cli.ts`
- Node-targeted TypeScript config
- shared lint and formatting config wiring

Design constraints for the real implementation:

- The proxy is an Express app, so `express` is a hard dependency here.
- Upstream forwarding goes through `http-proxy-middleware`.
- Middleware and adapter integration flows through `@boltwall/middleware` and
  `@boltwall/adapters`, not bespoke protocol logic in this package.
