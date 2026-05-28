# Contributing

Boltwall Suite is preparing for its first stable public release. Contributions
are welcome, with a maintainer-guided process until the v0.1.0 API and
deployment path are declared stable.

## Before You Start

Small fixes, documentation improvements, and focused tests can be opened as
pull requests directly. Larger changes should start with a maintainer check
first, especially when they affect:

- L402 protocol behavior, wire formats, headers, caveats, macaroons, or tokens.
- Security boundaries, credential handling, root keys, invoices, or TLS.
- Public APIs, package boundaries, generated deploy output, or release behavior.
- Production deployment flows.

The L402 specification is the source of truth for protocol behavior. Read the
relevant spec section before changing protocol-sensitive code, and cite it in
the change record.

## Development Setup

Use Bun from the repository root:

```sh
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test
bun run build
```

Package and workflow-specific validation is documented in
[`docs/testing.md`](./docs/testing.md). Security-sensitive changes should also
follow [`docs/security-boundaries.md`](./docs/security-boundaries.md).

## Pull Requests

Pull requests should be narrow and reviewable. Include:

- The problem being solved.
- The validation commands run.
- Any relevant spec citations for protocol-sensitive changes.
- Migration notes for public API or behavior changes.

Do not commit credentials, `.env` files, API keys, root keys, production
macaroons, or generated local state. Do not include secret values in logs,
screenshots, fixtures, or issue text.

## Security Reports

Do not open public issues for vulnerabilities, leaked credentials, or suspected
secret exposure. Contact the maintainer privately until the project publishes a
dedicated `SECURITY.md`.

## Releases

Releases are maintainer-controlled. Contributors may propose release-affecting
changes, but API stability declarations, production deploy decisions, and npm
publishing happen only after maintainer approval. Once a release change is
approved and merged, Changesets automation handles the publish mechanics.

## Licensing

By contributing, you agree that your contribution is submitted under the
repository's MIT license and that you have the right to submit it. This project
does not require a CLA or DCO at this time.

## Conduct

Keep discussion respectful, focused, and constructive.
