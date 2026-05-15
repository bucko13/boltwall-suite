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

Later tasks deepen the runtime-backed pieces without changing the primary
learning goal:

- `bw-0dw.3` wires the real Pokedex paid endpoint.
- Phase 4 middleware tasks provide the real 402/authorization state machine.
- Phase 6 proxy work may provide integration targets, but proxy and middleware
  setup are supporting details rather than the playground's main experience.
- Phase 7 exit-gate work verifies the full playground flow after those pieces
  land.

## Paid Pokedex endpoint

`GET /api/pokemon/:id` is protected by the Web Fetch `authorizeL402` core. A
missing credential returns a dual LSAT-first/L402-second 402 challenge; a valid
paid retry proxies to `https://pokeapi.co/api/v2/pokemon/:id`.

Production payment config lives in `lib/server/payment-config.ts` and validates
environment variables with `zod`. Playwright-only mock payments live separately
in `lib/server/test-payment-config.ts`, and `lib/server/payment-runtime.ts`
selects that test config only when explicitly enabled outside production.
Backend credential variables must never use `NEXT_PUBLIC_`.

Supported backend selections:

```sh
# Local development and Playwright e2e can opt into MockAdapter.
BOLTWALL_PLAYGROUND_BACKEND=mock
BOLTWALL_PLAYGROUND_ENABLE_TEST_PAYMENT=1

# LND or Voltage-hosted LND use the same adapter shape.
BOLTWALL_PLAYGROUND_BACKEND=lnd
BOLTWALL_PLAYGROUND_BACKEND=voltage-lnd
LND_SOCKET=127.0.0.1:10009
LND_CERT_BASE64=<base64 tls cert>
LND_MACAROON_BASE64=<base64 macaroon>
```

Production fails closed unless `BOLTWALL_PLAYGROUND_BACKEND` and the required
backend credentials are present. Error messages name missing variables but do
not print credential values.
