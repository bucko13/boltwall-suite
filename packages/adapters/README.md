# @boltwall/adapters

Lightning backend adapters for Boltwall Suite.

New to L402? See the [project README](../../README.md#what-is-l402) for how
the packages fit together.

## Installation

```sh
bun add @boltwall/adapters
```

The generated
[API reference](https://bucko13.github.io/boltwall-suite/modules/_boltwall_adapters.html)
is the durable reference for constructor options, capability flags, environment
loaders, provider metadata, errors, and persistence hooks.

The root entrypoint exposes the shared backend contract only. Concrete adapters
are loaded from subpath entrypoints so consumers do not pull unused provider
dependencies into their server bundle.

```ts
import { assertBackendSupports, type LightningBackend } from "@boltwall/adapters";

assertBackendSupports(backend, { hodl: true });
```

## Adapter entrypoints

| Entry point                   | Use for                                                      | Capability shape                                                                           |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `@boltwall/adapters/lnd`      | LND gRPC nodes, including local regtest and hosted LND nodes | HODL invoices, invoice cancellation, invoice streams, and custom descriptions              |
| `@boltwall/adapters/opennode` | OpenNode REST charge API                                     | Custom descriptions; HODL, cancellation, and adapter-level invoice streams are unsupported |
| `@boltwall/adapters/btcpay`   | BTCPay Server Greenfield store Lightning API                 | Custom descriptions; HODL, cancellation, and adapter-level invoice streams are unsupported |
| `@boltwall/adapters/testing`  | Unit tests, browser import checks, playground demos          | Deterministic in-memory backend with the full capability surface                           |

Provider-specific charge IDs and invoice IDs stay inside concrete adapters.
Middleware and proxy code should depend on normalized `paymentHash` lookup and
capability flags rather than provider business terms.

## LND

```ts
import { LndAdapter } from "@boltwall/adapters/lnd";

const backend = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  cert: process.env.LND_TLS_CERT!,
  macaroon: process.env.LND_MACAROON!,
});
```

For Boltwall's local regtest helpers, `LND_TLS_CERT` is certificate content and
`LND_MACAROON` is admin macaroon content; `infra/scripts/lnd-env` emits both as
base64. Path-based interop tooling should use explicit path variable names such
as `LND_TLS_CERT_PATH`.

Voltage Cloud nodes are standard LND nodes: construct `LndAdapter` directly with
the node's gRPC socket (`<node>.m.voltageapp.io:10009`), admin macaroon, and TLS
cert. The dashboard's REST URL on port 8080 is not the gRPC endpoint.

## OpenNode

```ts
import { createOpenNodeAdapterFromEnv } from "@boltwall/adapters/opennode";

const backend = createOpenNodeAdapterFromEnv();
```

Use `OpenNodeAdapter` for explicit configuration or to inject a persistent
`OpenNodeChargeStore`. The default store is process-local memory, so deployments
that must look up invoices after a restart should persist the
`paymentHash -> chargeId` mapping outside the adapter.

`openNodeEnvVariables` and `openNodeProviderMetadata` describe supported
environment variables and provider capability facts for API reference and
CLI/help output.

## BTCPay Server

```ts
import { createBtcPayAdapterFromEnv } from "@boltwall/adapters/btcpay";

const backend = createBtcPayAdapterFromEnv();
```

BTCPay lookups require the opaque provider invoice id returned during creation.
The current adapter keeps that `paymentHash -> invoiceId` index in process
memory. Deployments that need restart-safe BTCPay lookup should add or wrap
persistent storage before relying on long-lived invoices.

`btcPayEnvVariables` and `btcPayProviderMetadata` describe supported environment
variables and provider capability facts for API reference and CLI/help output.

## Testing adapter

`@boltwall/adapters/testing` exports `MockAdapter`, a deterministic in-memory
backend for middleware, proxy, and playground tests. It advertises the full
capability surface and lets tests drive invoice state directly with `settle`,
`hold`, `expire`, `cancelInvoice`, and `settleHodlInvoice`.

The mock returns placeholder `mockbolt11_...` payment request strings rather
than real BOLT 11 invoices. Tests that need real invoice decoding should use
fixtures from [`@boltwall/l402`](../l402/README.md) or a concrete backend
adapter.

## Live integration tests

OpenNode and BTCPay integration tests live under
`packages/adapters/test/integration`. They are skipped by default and run only
when their per-provider env vars are set, so regular `bun run test` remains
infrastructure-free.

```sh
bun run --cwd packages/adapters test:integration
```

Use development, testnet, or owner-provided staging credentials only. Do not use
mainnet payment-provider credentials for tests that create invoices.

## Server-only boundary

Network/payment-provider adapters are server runtime code. Do not import LND,
OpenNode, or BTCPay adapters from playground client components or browser
bundles. Browser-facing code should depend on protocol helpers from
`@boltwall/l402` and test doubles from `@boltwall/adapters/testing`.

Only `@boltwall/adapters/testing` is built to run in the browser. The concrete
adapters keep server dependencies as bare external imports, so importing one
directly into a browser module graph fails to resolve rather than silently
shipping payment-provider code to a client bundle.
