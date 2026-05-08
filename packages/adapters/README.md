# @boltwall/adapters

Lightning backend adapters for Boltwall Suite.

This package is scaffolded in Phase 0. The shared backend types and the LND,
OpenNode, BTCPay, and testing adapters land in later beads.

## Planned entrypoints

- `@boltwall/adapters/lnd`
- `@boltwall/adapters/opennode`
- `@boltwall/adapters/btcpay`
- `@boltwall/adapters/testing`

## Notes

- There is intentionally no root `@boltwall/adapters` export. Consumers must
  import a specific subpath.
- `lightning` is a peer dependency so non-LND consumers do not pull it unless
  they need the LND adapter.
