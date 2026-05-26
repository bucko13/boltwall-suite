# `@boltwall/playground`

Private Next.js App Router playground for Boltwall Suite.

## Purpose

This app will become the interactive workbench for learning L402 by doing:

- building, parsing, and editing L402 challenges
- constructing and inspecting L402 credentials
- trying those credentials against a live L402-protected endpoint

The current app scaffolds the shell and local toolchain wiring.

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
parse, and edit challenges/credentials, then use the demo panel to request a
Pokemon resource, inspect any returned L402 challenge, pay it, retry, and see
the unlocked response.

The current first screen is a polished scaffold for that workflow. It keeps the
legacy playground's core product model — challenge parsing, token construction,
and live protected endpoint interaction — while the deployed proxy target is
still landing separately.

Runtime-backed proxy deployments are separate from the playground app. The demo
panel consumes public PokeAPI or a configured endpoint; it does not mint
invoices, hold backend credentials, or host the protected resource itself.

## Demo endpoint

With no configured proxy endpoint, the demo panel fetches a random Pokemon from
the public unprotected PokeAPI endpoint:

```sh
https://pokeapi.co/api/v2/pokemon/{id}
```

Set `NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT` at build time to point the
browser demo at a Boltwall-protected endpoint. The URL may contain `{id}` or
`:id`; if it ends in a numeric path segment, the demo replaces that segment
with the random Pokemon id.

When the endpoint returns a readable `402` challenge, the demo shows the L402
scheme, invoice, and macaroon, then lets the user retry with WebLN or by pasting
a paid preimage manually. Protected endpoints hosted on another origin need
CORS headers that allow the playground origin and expose `WWW-Authenticate`,
otherwise the browser cannot read the challenge header. `@boltwall/proxy`
supports this with `cors.allowOrigins`; configure the local playground origin or
hosted playground URL on the proxy deployment, not in client-side secrets.

For the umbrella workflows that wire the playground to a local regtest proxy or
a Vercel/Voltage proxy, see:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)
