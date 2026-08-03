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

| Entry point                   | Use for                                                      | Capability shape                                                                                      |
| ----------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `@boltwall/adapters/lnd`      | LND gRPC nodes, including local regtest and hosted LND nodes | HODL invoices, invoice cancellation, invoice streams, and custom descriptions                         |
| `@boltwall/adapters/opennode` | OpenNode REST charge API                                     | Custom descriptions; HODL, cancellation, and adapter-level invoice streams are unsupported            |
| `@boltwall/adapters/btcpay`   | BTCPay Server Greenfield store Lightning API                 | Custom descriptions; HODL, cancellation, and adapter-level invoice streams are unsupported            |
| `@boltwall/adapters/nwc`      | Nostr Wallet Connect services such as Alby Hub               | Custom descriptions; HODL, cancellation, and adapter-level invoice streams are unsupported in the PoC |
| `@boltwall/adapters/testing`  | Unit tests, browser import checks, playground demos          | Deterministic in-memory backend with the full capability surface                                      |

Provider-specific charge IDs and invoice IDs stay inside concrete adapters.
Middleware and proxy code should depend on normalized `paymentHash` lookup and
capability flags rather than provider business terms.

## LND

```ts
import { LndAdapter } from "@boltwall/adapters/lnd";

const backend = new LndAdapter({
  socket: process.env.LND_SOCKET!,
  // Self-signed node: the cert is the gRPC CA. Publicly-trusted node (e.g.
  // Voltage): pass "" to verify against the system CA store.
  cert: process.env.LND_TLS_CERT ?? "",
  macaroon: process.env.LND_MACAROON!,
});
```

`cert` is the node's TLS certificate, base64- or hex-encoded (this is what
`lightning` expects — a raw PEM is not accepted directly). It is used as the gRPC
CA, so it is only needed for a node with a **self-signed** certificate. For a
node served with a **publicly-trusted** certificate (e.g. Voltage), pass an empty
string so the connection is verified against the system CA store; supplying a
custom cert there makes it the only trusted CA and the TLS handshake fails. For
Boltwall's local regtest helpers, `infra/scripts/lnd-env` emits the cert and
admin macaroon as base64; path-based interop tooling should use explicit path
variable names such as `LND_TLS_CERT_PATH`.

Voltage Cloud nodes are standard LND nodes: construct `LndAdapter` with the
node's gRPC socket (`<node>.m.voltageapp.io:10009`) and admin macaroon, and an
empty `cert` (Voltage serves a publicly-trusted certificate). The dashboard's
REST URL on port 8080 is not the gRPC endpoint.

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

## Nostr Wallet Connect

```ts
import { createNwcAdapterFromEnv } from "@boltwall/adapters/nwc";

const backend = createNwcAdapterFromEnv();
```

The NWC adapter reads `NWC_CONNECTION_STRING` by default. Treat that value like
an LND macaroon or provider API key: it authorizes wallet requests and must not
be committed, logged, copied into `NEXT_PUBLIC_*` variables, or pasted into shell
history.

For Alby Hub, create a dedicated NWC app with the narrowest permissions needed
for the proxy. The standard Boltwall flow only needs receive/read invoice access
(`make_invoice` and `lookup_invoice`), so the connection string can come from an
app that cannot send payments.

This proof-of-concept uses NIP-47 `make_invoice` and `lookup_invoice` for the
standard challenge -> pay -> retry flow. It does not advertise HODL invoices,
cancellation, or streaming until those semantics are validated against target
wallet services such as Alby Hub.

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
OpenNode, BTCPay, or NWC adapters from playground client components or browser
bundles. Browser-facing code should depend on protocol helpers from
`@boltwall/l402` and test doubles from `@boltwall/adapters/testing`.

Only `@boltwall/adapters/testing` is built to run in the browser. The concrete
adapters keep server dependencies as bare external imports, so importing one
directly into a browser module graph fails to resolve rather than silently
shipping payment-provider code to a client bundle.
