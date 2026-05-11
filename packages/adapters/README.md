# @boltwall/adapters

Lightning backend adapters for Boltwall Suite.

The root entrypoint exposes shared backend types only. Concrete adapters are
loaded from subpath entrypoints so consumers do not pull in unused backend
dependencies.

```ts
import type { LightningBackend } from "@boltwall/adapters";
```

Middleware and proxy startup code can validate feature-dependent configuration
against a backend before serving requests:

```ts
import { assertBackendSupports } from "@boltwall/adapters";

assertBackendSupports(backend, { hodl: true });
```

## Adapter entrypoints

- `@boltwall/adapters/lnd`
- `@boltwall/adapters/opennode`
- `@boltwall/adapters/btcpay`
- `@boltwall/adapters/testing`

## Testing adapter

`@boltwall/adapters/testing` exports `MockAdapter`, a deterministic in-memory
backend for middleware, proxy, and playground tests. It advertises the full
capability surface and lets tests drive invoice state directly with `settle`,
`expire`, `cancelInvoice`, and `settleHodlInvoice`.

The mock returns placeholder `mockbolt11_...` payment request strings rather
than real BOLT 11 invoices. Tests that need real invoice decoding should use
fixtures from `@boltwall/l402` or a concrete backend adapter.

## Notes

- There is intentionally no root export for concrete adapter classes. Consumers
  import concrete implementations from a specific subpath.
- Capability validation is a boot-time check. Unsupported HODL, cancellation,
  streaming, or custom-description settings should fail before the first paid
  request reaches middleware.
- `lightning` is a peer dependency so non-LND consumers do not pull it unless
  they need the LND adapter.

## Provider compatibility notes

The shared `LightningBackend` contract is normalized around Boltwall's runtime
needs: create an invoice, recover its payment hash, and later look up settled
state by that payment hash. Provider-specific charge IDs, checkout IDs, or
invoice IDs stay inside concrete adapters. Adapters that need those IDs for
lookup or cancellation must persist their own `paymentHash -> provider id`
mapping; middleware and proxy code should not branch on provider business terms.

| Provider                 | Current constraint                                                                                                                                                                                                                                                                                                                                            | Adapter implication                                                                                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LND / Voltage-hosted LND | LND exposes gRPC/REST invoice APIs with millisatoshi fields, HODL invoice settlement/cancel paths, invoice subscription streams, and settled preimages. Voltage-hosted LND is still LND from the adapter boundary. See Lightning Labs `AddInvoice`, `LookupInvoice`, `SubscribeInvoices`, `SettleInvoice`, and `CancelInvoice` RPC docs.                      | `kind: "lnd"` can advertise the full capability surface when configured against an LND node: HODL, cancel, streaming invoices, custom descriptions, millisatoshi-safe amounts, and preimages on settled invoices.                                                         |
| OpenNode                 | OpenNode's charge API is charge-ID centered and creates Lightning charges with `amount` plus currency, callback/webhook URLs, and order metadata. The documented charge lifecycle is provider-state driven rather than HODL/preimage driven. See OpenNode "Creating a charge" and charge API docs.                                                            | The OpenNode adapter should mark HODL/cancel/streaming as unsupported unless an official API supports them. It must retain the OpenNode charge ID internally so `lookupInvoice(paymentHash)` remains provider-neutral.                                                    |
| BTCPay Server            | BTCPay Greenfield invoice APIs are store/invoice-ID centered. Lightning payment requests are exposed through payment-method data, and invoice transitions are usually observed by polling or webhooks. HODL settlement and settled preimage exposure are not a portable Greenfield invoice capability. See BTCPay Server Greenfield invoice and webhook docs. | The BTCPay adapter should mark HODL/cancel/streaming as unsupported unless configured against a backend-specific feature that proves otherwise. It must retain the BTCPay invoice ID internally and map provider statuses to `open`, `settled`, `canceled`, or `expired`. |

Official references:

- OpenNode charge creation: <https://developers.opennode.com/docs/creating-a-charge>
- OpenNode API reference: <https://developers.opennode.com/reference>
- BTCPay Server ecommerce/Greenfield integration: <https://docs.btcpayserver.org/Development/ecommerce-integration-guide/>
- BTCPay Server Greenfield API: <https://docs.btcpayserver.org/API/Greenfield/v1/>
- Lightning Labs LND API: <https://api.lightning.community/>
- Voltage LND node product docs: <https://docs.voltage.cloud/>

Server-only boundary: network/payment-provider adapters are server runtime code.
Do not import concrete adapters from playground client components or any browser
bundle. Browser-facing code should depend on protocol helpers from
`@boltwall/l402` and test doubles from `@boltwall/adapters/testing` only.
