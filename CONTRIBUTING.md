# Contributing

Contributions are welcome, with maintainer review on protocol-, security-, and
release-sensitive changes.

## Before you start

Small fixes, documentation improvements, and focused tests can be opened as pull
requests directly. Larger changes should start with a maintainer check first,
especially when they affect:

- L402 protocol behavior, wire formats, headers, caveats, macaroons, or tokens.
- Security boundaries, credential handling, root keys, invoices, or TLS.
- Public APIs, package boundaries, generated deploy output, or release behavior.
- Production deployment flows.

The L402 specification is the source of truth for protocol behavior. Read the
relevant spec section before changing protocol-sensitive code, and cite it in
your PR.

## Development setup

From the repository root:

```sh
bun install
bun run playground   # http://localhost:3000 — the demo workbench
```

Before opening a PR, run the full gate:

```sh
bun run check   # lint, typecheck, test, build
```

`bun run lint:fix` autofixes import order and formatting locally; CI runs only
the check-mode `lint`.

## Tests

Unit tests run with `bun run test` and gate every push. A few surfaces need infrastructure, so they are
**opt-in** — excluded from `bun run test` and run via their own scripts:

| Command | Covers | Needs |
|---|---|---|
| `bun run test` | unit tests, all packages | nothing |
| `bun run test:coverage` | unit coverage (informational thresholds) | nothing |
| `bun run test:browser` | built browser bundles import cleanly in Chromium | nothing (turbo builds first) |
| `bun run test:e2e` (`apps/playground`) | playground UI flows | nothing (dev server auto-starts) |
| `bun run test:interop` (`packages/l402`) | Aperture wire-format interop | **Docker + an LND regtest node** |
| `bun run test:integration` (`packages/adapters`) | live OpenNode / BTCPay adapters | **per-adapter credentials** (skipped without) |
| `bun run package-health` · `bun run size` | publint package-shape checks · l402 bundle budget | built packages |

Setup for the infra-dependent suites (`test:interop`, `test:integration`) lives
in their package READMEs. Add a regression test before fixing a bug, cover
positive and negative cases, prefer `@boltwall/test-fixtures` over ad-hoc
vectors, and for wire-format changes cite the spec and add conformance fixtures.
Security-sensitive changes also follow
[`docs/security-boundaries.md`](./docs/security-boundaries.md).

## Monorepo conventions

Bun workspaces + Turborepo. Packages live exactly one directory deep under
`packages/` or `apps/` (no nesting). Internal dependencies use `workspace:*` —
never `file:`, relative paths, or version numbers. Shared lint/TypeScript/
Prettier configuration lives in the `@boltwall/{eslint,typescript,prettier}-config`
packages; extend those presets rather than copying config. Each package declares
its own third-party dependencies — don't centralize them or re-export them from
`@boltwall/internal`. Run tasks from the root (`bun run <task>`); `turbo.json`
owns the task graph. To add a package: create one directory, add an ESM
`package.json` with exports and shared-config deps, run `bun install` at the root
(never hand-edit lockfiles), and add package-health checks for publishable ones.

## Dependencies

Prefer a small `@boltwall/internal` utility over a new external dependency when
the functionality fits in roughly 200 lines of clear, well-tested TypeScript
(base64url, hex/`Uint8Array` converters, constant-time compare, small parsers).
Reach for external packages for cryptographic primitives, established protocol
implementations (BOLT 11, macaroon binary format), and framework integrations.

When you do add one, justify it in the PR ("I considered building this in
`@boltwall/internal` but …") and vet it: maintainer and ownership history,
package health, risk scanners (Socket.dev, OSV, advisories), transitive surface,
and lifecycle scripts. Provenance is an integrity signal, not a safety signal —
verify against expectations rather than treating an attestation as approval.

Install-time defenses are enforced in `bunfig.toml` for every `bun install`,
local and CI alike: a 7-day `minimumReleaseAge` gate and `ignoreScripts = true`
(no `preinstall`/`install`/`postinstall`/`prepare` hooks). See `bunfig.toml` to
allow an urgent younger patch. This is the project's defense against the
Shai-Hulud-class npm supply-chain attacks.

## CI & workflows

Workflow files under `.github/workflows/` are a shared CI/release surface — keep
changes small and reviewable. Rules, enforced in review:

- Pin every action to a full 40-char commit SHA with the tag in a trailing
  comment (`uses: actions/checkout@<sha> # v4.3.1`); floating tags and short
  SHAs are rejected.
- Every workflow declares a top-level least-privilege `permissions:` block
  (default `contents: read`); justify per-job overrides inline. Only the release
  and GitHub Pages deploy jobs may hold `id-token: write`, and only on the job
  that requests it.
- CI installs run with `--frozen-lockfile`; locally `bun install` is enough (the
  `bunfig.toml` `ignoreScripts` baseline applies to both).
- `pull_request_target` needs explicit maintainer sign-off — it grants
  write-scoped tokens to untrusted PR code; default to `pull_request`.

## Pull requests

Keep PRs narrow and reviewable. Include the problem being solved, the validation
commands you ran, spec citations for protocol-sensitive changes, and migration
notes for public API or behavior changes.

Do not commit credentials, `.env` files, API keys, root keys, production
macaroons, or generated local state, and don't include secret values in logs,
screenshots, fixtures, or issue text.

## Security reports

Do not open public issues for vulnerabilities, leaked credentials, or suspected
secret exposure. Contact the maintainer privately until the project publishes a
dedicated `SECURITY.md`.

## Releases

Releases are maintainer-controlled. Contributors may propose release-affecting
changes, but API stability declarations, production deploy decisions, and npm
publishing happen only after maintainer approval. Once approved and merged,
Changesets automation handles the publish mechanics.

## Licensing

By contributing, you agree your contribution is submitted under the repository's
MIT license and that you have the right to submit it. No CLA or DCO is required
at this time.

## Conduct

Keep discussion respectful, focused, and constructive.
