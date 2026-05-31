# Architecture

Boltwall Suite is a TypeScript monorepo for L402 Lightning Network service
authentication. Its mission is a spec-correct protocol library, server
middleware, deployable proxy, demo playground, and shared adapters for Lightning
backends.

## Layout

```text
boltwall-suite/
├── apps/
│   └── playground/                 # @boltwall/playground
├── packages/
│   ├── l402/                       # @boltwall/l402 protocol library
│   ├── middleware/                 # Web Fetch core plus Express adapter
│   ├── adapters/                   # Lightning backends
│   ├── proxy/                      # reverse proxy package and CLI
│   ├── internal/                   # private shared runtime utilities
│   ├── test-fixtures/              # L402 conformance vectors
│   ├── eslint-config/              # shared ESLint config
│   ├── typescript-config/          # shared tsconfig presets
│   └── prettier-config/            # shared Prettier config
├── examples/
└── docs/
```

## Package Roles

- `@boltwall/l402` owns protocol behavior. Middleware, proxy, and playground
  consume it rather than reimplementing wire parsing or verification. Its
  macaroon codec is a private implementation detail used to implement the
  public mint/verify APIs, not a shared package or exported subpath.
- `@boltwall/middleware` exposes a Web Fetch core plus an Express adapter.
  Web-Fetch-native runtimes consume the core directly.
- `@boltwall/adapters` uses subpath exports such as `/lnd`, `/opennode`,
  `/btcpay`, and `/testing`.
- `@boltwall/internal` holds small shared utilities.
- `@boltwall/test-fixtures` is the single source of truth for L402 wire vectors.

## Placement Rules

- Add behavior to the smallest package that can own it.
- Prefer extending existing modules over adding new files.
- Follow existing package, export, and capability-flag patterns.
- Test both Node and browser import behavior for cross-runtime
  `@boltwall/l402` changes.

## Non-Goals

- gRPC L402.
- Edge runtime support for middleware/proxy.
- CLN and LDK adapters in the initial public release.
- CJS builds.
- Older browsers.
- Hosted SaaS proxy.
- Browser extension version of the playground.
- Fastify, Koa, or Hapi middleware adapters.
