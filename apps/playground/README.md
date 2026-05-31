# @boltwall/playground

Interactive L402 workbench for Boltwall Suite.

New to L402? Start with [What is L402?](../../README.md#what-is-l402) in the
project README.

## What You Can Try

The playground is the fastest way to learn the L402 flow without writing an
app first. Use it to build and inspect payment challenges, add caveats, verify
credentials, and walk through a protected HTTP request.

- **Generate:** build a valid `WWW-Authenticate: L402` challenge.
- **Parse:** decode a challenge, credential, or macaroon into readable fields.
- **Caveats:** inspect a macaroon and add first-party caveats.
- **Validate:** check whether a credential satisfies a challenge.
- **Demo:** request an endpoint, inspect a `402 Payment Required` challenge,
  pay the invoice, and retry with an L402 credential.

Terms that appear throughout the app:

- **L402:** an HTTP 402 authentication protocol for paid access.
- **Macaroon:** the bearer token inside an L402 challenge. It carries caveats,
  which are the conditions the server enforces.
- **BOLT 11 invoice:** the Lightning invoice the client pays.
- **Preimage:** proof returned after payment settlement. A paid retry combines
  the macaroon and preimage in an `Authorization` header.
- **WebLN:** a browser wallet API, such as Alby, that can request a Lightning
  payment from the page.

## Run Locally

From the repository root:

```sh
bun install
bun run playground
```

The app starts at <http://localhost:3000>.

Useful package commands:

```sh
bun run --cwd apps/playground dev
bun run --cwd apps/playground build
bun run --cwd apps/playground lint
bun run --cwd apps/playground typecheck
bun run --cwd apps/playground test:e2e
bun run --cwd apps/playground test:a11y
```

Playwright starts its own dev server for `test:e2e` and `test:a11y`.

## Demo endpoint

With no configured proxy endpoint, the Demo panel fetches a random Pokemon from
public PokeAPI:

```sh
https://pokeapi.co/api/v2/pokemon/{id}
```

Set `NEXT_PUBLIC_BOLTWALL_PLAYGROUND_DEMO_ENDPOINT` at build time to point the
browser demo at a Boltwall-protected endpoint. The URL may contain `{id}` or
`:id`; if it ends in a numeric path segment, the demo replaces that segment
with the random Pokemon id.

When the endpoint returns a readable `402` challenge, the Demo panel shows the
L402 scheme, invoice, and macaroon. You can pay with a WebLN wallet or paste a
preimage manually, then retry the request with the paid credential.

Protected endpoints on another origin need CORS headers that allow the
playground origin and expose `WWW-Authenticate`; otherwise the browser cannot
read the challenge. [`@boltwall/proxy`](../../packages/proxy/README.md) supports
this with `cors.allowOrigins`. Configure the local or hosted playground origin
on the proxy deployment, not in client-side secrets.

The Demo panel also accepts reusable bearer credentials. Paste a full
`Authorization` value, compose one from a macaroon and preimage, or load the
macaroon currently stored in workbench memory. Custom credentials are used
before the credential cached by the Demo panel and remain editable until
cleared.

## Full Payment Flows

To connect the playground to a real proxy and Lightning backend, use one of the
end-to-end guides:

- [Local regtest proxy and playground](../../docs/local-regtest-proxy-playground.md)
- [Vercel Voltage Pokedex demo](../../docs/vercel-voltage-pokedex-demo.md)
