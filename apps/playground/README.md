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
parse, and edit challenges/credentials, then point the demo panel at an endpoint
to inspect its response and any `WWW-Authenticate` challenge.

The current first screen is a polished scaffold for that workflow. It keeps the
legacy playground's core product model — challenge parsing, token construction,
and live protected endpoint interaction — while the deployed proxy target is
still landing separately.

Runtime-backed proxy deployments are separate from the playground app. The demo
panel only consumes a configured endpoint; it does not mint invoices, hold
backend credentials, or host the protected resource itself.

## Demo endpoint

The demo panel defaults to the public unprotected PokeAPI endpoint:

```sh
https://pokeapi.co/api/v2/pokemon/1
```

Set `NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT` at build time to point the
browser demo at a Boltwall-protected endpoint. Protected endpoints that are
hosted on another origin need CORS headers that allow the playground origin and
expose `WWW-Authenticate`, otherwise the browser cannot read the challenge
header.

For the umbrella workflows that wire the playground to a local regtest proxy or
a Vercel/Voltage proxy, see:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)
