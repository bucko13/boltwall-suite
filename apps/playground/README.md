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

## Playground direction

The playground is an educational L402 workbench. Users should be able to build,
parse, and edit challenges/credentials, then try the same credential flow against
a live L402-protected endpoint.

The current first screen is a polished scaffold for that workflow. It keeps the
legacy playground's core product model — challenge parsing, token construction,
and live protected endpoint interaction — while the real backend endpoint is
still landing.

Later beads replace the mocked surfaces:

- `bw-0dw.3` wires the real Pokedex paid endpoint.
- Phase 4 middleware beads provide the real 402/authorization state machine.
- Phase 6 proxy beads replace the proxy deployment preview with runtime-backed
  configuration.
- Phase 7 exit-gate work verifies the full playground flow after those pieces
  land.
