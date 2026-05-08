# @boltwall/middleware

Node-focused L402 middleware for Boltwall Suite.

This package is scaffolded in Phase 0. The Web Fetch authorization core,
Express adapter, logger wiring, and security-sensitive verification logic land
in later beads.

## Planned entrypoints

- `@boltwall/middleware` — root export of the Web Fetch core
- `@boltwall/middleware/core` — explicit core entrypoint
- `@boltwall/middleware/express` — Express 4/5 adapter

## Notes

- `express` is a peer dependency so core-only consumers do not pull it
  transitively.
- `pino` is a runtime dependency because structured logging with redaction is
  part of the middleware package design.
