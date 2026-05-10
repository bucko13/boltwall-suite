# `@boltwall/playground`

Private Next.js App Router playground for Boltwall Suite.

## Purpose

This app will become the interactive workbench for learning L402 by doing:

- building, parsing, and editing L402 challenges
- constructing and inspecting L402 credentials
- trying those credentials against a live L402-protected endpoint

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

Later beads deepen the runtime-backed pieces without changing the primary
learning goal:

- `bw-0dw.3` wires the real Pokedex paid endpoint.
- Phase 4 middleware beads provide the real 402/authorization state machine.
- Phase 6 proxy work may provide integration targets, but proxy and middleware
  setup are supporting details rather than the playground's main experience.
- Phase 7 exit-gate work verifies the full playground flow after those pieces
  land.
