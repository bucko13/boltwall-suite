# `@boltwall/playground`

Private Next.js App Router playground for Boltwall Suite.

## Purpose

This app will become the interactive demo for:

- L402 header and credential inspection
- paid endpoint walkthroughs
- proxy/paywall flows backed by the Boltwall workspace packages

Phase 0 only scaffolds the app shell and local toolchain wiring.

## Workspace integration

- Extends `@boltwall/typescript-config/nextjs.json`
- Extends `@boltwall/eslint-config/next.js`
- Uses `@boltwall/prettier-config`

## Commands

```sh
bun run dev
bun run build
bun run lint
bun run typecheck
bun run test:e2e
```

## Mocked demo shell

The current first screen is a mocked, local-state-only paid-flow and proxy
preview for `bw-0dw.11`. It does not connect to a wallet, Lightning backend,
middleware package, proxy runtime, or real Pokedex API.

Later beads replace the mocked surfaces:

- `bw-0dw.3` wires the real Pokedex paid endpoint.
- Phase 4 middleware beads replace the mocked 402/authorization state machine.
- Phase 6 proxy beads replace the proxy deployment preview with runtime-backed
  configuration.
- Phase 7 exit-gate work verifies the full playground flow after those pieces
  land.
