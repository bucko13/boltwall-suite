# Documentation

Guides, references, and runbooks for Boltwall Suite. Start with the
[root README](../README.md) for an overview and the packages, then dig in here.

## Concepts and reference

| Document | What it covers |
| -------- | -------------- |
| [architecture.md](./architecture.md) | How the monorepo fits together: the protocol library, middleware, proxy, playground, and Lightning adapters. |
| [protocol-compatibility.md](./protocol-compatibility.md) | How `@boltwall/l402` behaves relative to the L402 spec, Aperture, `lsat-js`, and legacy `boltwall`. |
| [numeric-strategy.md](./numeric-strategy.md) | Conventions for money amounts, timestamps, and other numeric values that cross package boundaries. |
| [security-boundaries.md](./security-boundaries.md) | Expanded security reference for contributors: secrets, trust boundaries, and handling rules. |
| [api-docs.md](./api-docs.md) | How the generated API reference is built and what JSDoc the public surface needs. |

## Walkthroughs and runbooks

| Document | What it covers |
| -------- | -------------- |
| [local-regtest-proxy-playground.md](./local-regtest-proxy-playground.md) | Run the full challenge → pay → retry path locally with a two-node LND regtest topology. |
| [vercel-voltage-pokedex-demo.md](./vercel-voltage-pokedex-demo.md) | Deploy an `@boltwall/proxy` to Vercel backed by a Voltage-hosted LND node. |

## Migration

| Document | What it covers |
| -------- | -------------- |
| [migration-from-boltwall.md](./migration-from-boltwall.md) | Move from the legacy `bucko13/boltwall` middleware to `@boltwall/middleware`. |
| [migration-from-lsat-js.md](./migration-from-lsat-js.md) | Map each `Tierion/lsat-js` API to its `@boltwall/l402` equivalent. |
