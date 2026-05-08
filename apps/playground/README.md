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

## Status

UI structure, shadcn setup, and paid-flow implementation land in later beads.
