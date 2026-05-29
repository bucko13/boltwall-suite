# `@boltwall/playground`

Next.js App Router workbench for the Boltwall Suite.

New to L402? See the [project README](../../README.md#what-is-l402) for what L402 is and how the packages fit together.

## Glossary

- **L402** — an HTTP 402-based authentication protocol that gates resources behind a Lightning Network micropayment.
- **Macaroon** — a bearer credential embedded in the L402 challenge; carries the access conditions the server will enforce.
- **WebLN** — a browser extension API (e.g. Alby) that lets a web page request a Lightning payment from the user's wallet.
- **Preimage** — the payment secret revealed when a Lightning invoice is settled; proves the invoice was paid.
- **BOLT 11** — the Lightning Network invoice encoding standard; the payable invoice string in an L402 challenge is a BOLT 11 invoice.

## Purpose

This app is the interactive workbench for learning L402 by doing:

- **Generate** — build a well-formed L402 challenge from configurable parameters
- **Parse** — decode any `WWW-Authenticate: L402` header into its macaroon and invoice fields
- **Caveats** — inspect and compose first-party caveats on a macaroon
- **Validate** — verify a credential (macaroon + preimage) satisfies the challenge conditions
- **Demo** — request a live L402-protected endpoint, inspect the returned challenge, pay via WebLN or a pasted preimage, and view the unlocked response

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
bun run test:a11y
bun run build && bun run lhci:a11y
```

Playwright `test:e2e` and `test:a11y` need a dev server, which the config starts; `lhci:a11y` requires a production build first.

## Playground direction

The playground is an educational L402 workbench. Users can build, parse, and
edit challenges/credentials, then use the demo panel to request a Pokemon
resource, inspect any returned L402 challenge, pay it, retry, and see the
unlocked response.

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
otherwise the browser cannot read the challenge header. [`@boltwall/proxy`](../../packages/proxy/README.md)
supports this with `cors.allowOrigins`; configure the local playground origin or
hosted playground URL on the proxy deployment, not in client-side secrets.

The demo also has an Advanced credential area for reusable bearer credentials.
Users can paste a full `Authorization` value, compose one from a macaroon and
preimage, or load the macaroon currently stored in Workbench memory. Custom
credentials are used before the paid credential cached by the demo itself and
remain editable until cleared. If the endpoint rejects a custom credential, the
demo keeps the rejection visible and offers controls to clear it or request a
fresh challenge.

For the umbrella workflows that wire the playground to a local regtest proxy or
a Vercel/Voltage proxy, see:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)
