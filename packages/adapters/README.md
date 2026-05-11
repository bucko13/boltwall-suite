# @boltwall/adapters

Lightning backend adapters for Boltwall Suite.

The root entrypoint exposes shared backend types only. Concrete adapters are
loaded from subpath entrypoints so consumers do not pull in unused backend
dependencies.

```ts
import type { LightningBackend } from "@boltwall/adapters";
```

## Adapter entrypoints

- `@boltwall/adapters/lnd`
- `@boltwall/adapters/opennode`
- `@boltwall/adapters/btcpay`
- `@boltwall/adapters/testing`

## Notes

- There is intentionally no root export for concrete adapter classes. Consumers
  import concrete implementations from a specific subpath.
- `lightning` is a peer dependency so non-LND consumers do not pull it unless
  they need the LND adapter.
