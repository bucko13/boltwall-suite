# Boltwall Suite

[![CI](https://github.com/bucko13/boltwall-suite/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bucko13/boltwall-suite/actions/workflows/ci.yml)
[![Coverage](https://codecov.io/gh/bucko13/boltwall-suite/branch/main/graph/badge.svg)](https://codecov.io/gh/bucko13/boltwall-suite)
[![l402 bundle size](https://img.shields.io/badge/%40boltwall%2Fl402-%E2%89%A4150%20kB%20brotli-blue)](packages/l402)
[![npm](https://img.shields.io/badge/npm-not%20yet%20published-inactive)](https://www.npmjs.com/org/boltwall)
[![Vercel Production](https://img.shields.io/github/deployments/bucko13/boltwall-suite/Production?label=vercel&logo=vercel&logoColor=white)](https://boltwall-suite-playground.vercel.app)

A TypeScript toolkit for **L402**, the Lightning Network service authentication
protocol.

**[Try the live playground →](https://boltwall-suite-playground.vercel.app)**
to inspect L402 challenges, generate and parse credentials, and walk a paid
endpoint end to end.

## What is L402?

L402 authenticates access to HTTP services with Lightning Network payments. It
uses [macaroons](https://research.google/pubs/pub41892/) (cryptographic bearer
tokens with attenuable caveats) bound to Lightning invoices, so an endpoint can
ask for a payment before serving a protected resource. No accounts, API keys, or
rate-limit dashboard are required.

L402 is the modern incarnation of what was originally called **LSAT**. The wire format and naming have settled; the spec lives at <https://github.com/lightninglabs/L402>.

## What is Boltwall Suite?

Boltwall Suite is a fresh TypeScript implementation of the L402 ecosystem,
modernizing patterns from earlier projects (`lsat-js`, `boltwall`,
`now-boltwall`, `lsat-playground`). It provides standalone packages for
protocol work, HTTP middleware, Lightning backends, and proxy deployments, so
you can add L402 payments to new code or put a paywall in front of an existing
service.

Design goals:

- **Protocol-correct.** The L402 spec is the source of truth. [Aperture](https://github.com/lightninglabs/aperture) (the Lightning Labs Go implementation) is the interop reference.
- **Browser and Node.** The core protocol library runs in both. Public API uses `Uint8Array`, not `Buffer`.
- **Plug and play.** Packages should be easy to integrate into existing
  services and deployment shapes.
- **Self-guided learning.** The playground and docs should make macaroons and
  Bitcoin-powered paywalls approachable.
- **MIT-licensed.** Packages publish under the [`@boltwall`](https://www.npmjs.com/org/boltwall) npm scope.

## Packages

| Package                                                   | Status  | Purpose                                                                                                  |
| --------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- |
| [`@boltwall/l402`](./packages/l402/README.md)             | Private | Browser + Node protocol library: header parsing, macaroon mint/verify, caveat helpers, BOLT 11 utilities |
| [`@boltwall/middleware`](./packages/middleware/README.md) | Private | Web Fetch core + Express adapter for protecting HTTP endpoints                                           |
| [`@boltwall/adapters`](./packages/adapters/README.md)     | Private | Lightning backend interface + LND / OpenNode / BTCPay adapters via subpath exports                       |
| [`@boltwall/proxy`](./packages/proxy/README.md)           | Private | Reverse proxy package + installable CLI for local and Vercel deploys                                     |
| [`@boltwall/playground`](./apps/playground/README.md)     | Private | Next.js demo site for inspecting L402 challenges, credentials, and paid endpoint behavior                |

These packages are not yet published to npm; clone the repo to use them (see Quickstart).

**Which package do I use?**

- Protect an Express/Next.js/Hono endpoint → [`@boltwall/middleware`](./packages/middleware/README.md) + [`@boltwall/adapters`](./packages/adapters/README.md)
- Parse, mint, or verify L402 headers and credentials → [`@boltwall/l402`](./packages/l402/README.md)
- Put a payment gate in front of an existing API without changing it → [`@boltwall/proxy`](./packages/proxy/README.md)
- Try the full challenge → pay → retry flow → the [playground](https://boltwall-suite-playground.vercel.app)

## Quickstart

The fastest way to see L402 in action is the playground:

```sh
git clone https://github.com/bucko13/boltwall-suite.git
cd boltwall-suite
bun install
bun run playground       # starts the playground on http://localhost:3000
```

Open <http://localhost:3000> to inspect a `WWW-Authenticate` challenge, generate
and parse credentials, and walk a paid endpoint end to end. Packages are not
published yet, so cloning the repo and running the playground is the easiest way
to explore today.

Working on the suite itself? See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup,
tests, and the development checks.

## API Reference

Generated API documentation, built from TypeScript signatures and JSDoc with
[TypeDoc](https://typedoc.org), covers the public surface of
[`@boltwall/l402`](./packages/l402/README.md),
[`@boltwall/middleware`](./packages/middleware/README.md),
[`@boltwall/adapters`](./packages/adapters/README.md), and
[`@boltwall/proxy`](./packages/proxy/README.md). Start with the
[API reference landing page](./docs/api-reference.md) for package entry points
and high-value symbols.

Build it locally:

```sh
bun run docs:api   # outputs a static HTML site to docs-site/
```

Then open `docs-site/index.html`. The hosted reference publishes to GitHub Pages
from `main` via the [Docs workflow](./.github/workflows/docs.yml) and serves at
<https://bucko13.github.io/boltwall-suite/>.

## L402 / LSAT compatibility

The current spec name is `L402`. For backward compatibility:

- Servers should accept both `LSAT` and `L402` schemes on incoming requests.
- Servers should emit dual `WWW-Authenticate` challenges by default, with `LSAT` first and `L402` second, per Lightning Labs L402 spec §10.
- Library serializers can be configured to emit `L402`-only output for explicit greenfield or test scenarios.

## Development

For local development, contribution validation, and cross-package testing, use
the workflows that exercise the suite the way a user will:

- [Local regtest proxy and playground workflow](./docs/local-regtest-proxy-playground.md):
  bootstrap a two-node Bitcoin/LND regtest topology, run the proxy against
  PokeAPI, point the local playground at the protected Pokemon resource, inspect
  the 402 challenge, pay from the second node, and retry with the L402
  credential.
- [Vercel + Voltage Pokedex proxy workflow](./docs/vercel-voltage-pokedex-demo.md):
  deploy a `boltwall` proxy to Vercel against a Voltage-hosted LND node (a plain
  LND node consumed via the standard `lnd` backend), configure the production
  playground to use that proxy endpoint, and verify the live
  challenge/payment/retry path.

Package-specific details live in package READMEs:

- [`@boltwall/l402`](./packages/l402/README.md) for the protocol primitives:
  parsing challenges, minting and verifying credentials, and caveat helpers.
- [`@boltwall/middleware`](./packages/middleware/README.md) for protecting an
  HTTP endpoint (Web Fetch core plus Express/Next.js/Hono usage).
- [`@boltwall/adapters`](./packages/adapters/README.md) for Lightning backend
  setup, including the `lnd` backend used for self-hosted and Voltage-hosted
  LND nodes.
- [`@boltwall/proxy`](./packages/proxy/README.md) for CLI config, local proxy
  dev, Vercel deploys, header forwarding, and backend env names.
- [`@boltwall/playground`](./apps/playground/README.md) for the configurable
  demo endpoint and browser CORS requirements.

Local regtest helper scripts are available from the repo root:

```sh
bun run infra -- --help
bun run bootstrap -- --nodes payer,server
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening larger protocol,
security, deployment, or public API changes.

## Playground

The playground is a Next.js/Vercel app for inspecting L402 headers, caveats,
invoices, credentials, and payment flows. The Demo panel calls a configured
protected endpoint and shows the response status plus any `WWW-Authenticate`
challenge; the paid resource is served by a separately deployed [`@boltwall/proxy`](./packages/proxy/README.md)
that the playground points at via configuration. The
[local regtest workflow](./docs/local-regtest-proxy-playground.md) walks the full
challenge → pay → retry path end to end.

## Security

- L402 credentials are bearer credentials. Production deployments require TLS.
- Macaroons, preimages, root keys, API keys, and invoices with sensitive metadata must not be logged or committed.
- Middleware must verify invoice amounts against configured prices.
- Server-side verification must use constant-time comparison for payment hashes and signatures.
- Legacy `LSAT` compatibility is for wire interoperability only; new public APIs use L402 naming.

## Reference and legacy projects

These projects are referenced for historical context.

- [Tierion/lsat-js](https://github.com/Tierion/lsat-js): legacy MIT protocol library.
- [bucko13/boltwall](https://github.com/bucko13/boltwall): legacy server middleware (AGPL-3.0).
- [bucko13/now-boltwall](https://github.com/bucko13/now-boltwall): legacy Vercel deploy CLI.
- [bucko13/lsat-playground](https://github.com/bucko13/lsat-playground): legacy demo site.

For the Go reference implementation, see [lightninglabs/aperture](https://github.com/lightninglabs/aperture).

`bucko13/boltwall` is AGPL-3.0 and is reference-only for this MIT rewrite. Do not copy AGPL source code, comments, tests, or generated docs into this repository.

## License

[MIT](./LICENSE) © Boltwall Suite contributors.
