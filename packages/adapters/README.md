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
- `@boltwall/adapters/voltage-lnd`
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

## Voltage-hosted LND

`@boltwall/adapters/voltage-lnd` is a thin profile/factory over the LND adapter
for Voltage Cloud hosted nodes. Voltage exposes the full LND gRPC + REST API
([Voltage LND Node API docs](https://docs.voltage.cloud/lnd-node-api)), so the
returned adapter is an ordinary `LndAdapter` with the same capability surface
(`hodl`, `cancelInvoice`, `streamingInvoices`, `customDescription`). No LND
behavior is duplicated.

```ts
import { createVoltageLndAdapter } from "@boltwall/adapters/voltage-lnd";

const backend = createVoltageLndAdapter({
  baseUrl: process.env.VOLTAGE_LND_BASE_URL!,
  macaroon: process.env.VOLTAGE_LND_MACAROON!,
  cert: process.env.VOLTAGE_LND_CERT!,
});
```

Or, with the bundled typed env loader:

```ts
import { createVoltageLndAdapterFromEnv } from "@boltwall/adapters/voltage-lnd";

const backend = createVoltageLndAdapterFromEnv();
```

### Configuration shape

- `VOLTAGE_LND_BASE_URL` — bare host (`node.m.voltageapp.io`), `host:port`, or
  full `https://…` URL from the Voltage dashboard's "Node Details" tile. The
  factory normalizes to `host:10009` for gRPC. The documented REST port
  ([8080](https://docs.voltage.cloud/rest-api-examples)) is substituted with
  the gRPC port (`10009`) silently because the underlying adapter speaks gRPC.
- `VOLTAGE_LND_MACAROON` — admin macaroon as a lowercase hex string from the
  dashboard's "Admin Macaroon" tile. See
  [Voltage LND Node API](https://docs.voltage.cloud/lnd-node-api).
- `VOLTAGE_LND_CERT` — TLS certificate provided by the Voltage dashboard.
  Both raw base64 and full PEM-with-headers forms are accepted; the
  underlying `lightning` package normalizes them.

`loadVoltageLndEnv` throws a `VoltageLndEnvError` that does not echo macaroon
or cert values in error messages.

### Capability flags

Voltage's documentation describes the LND surface as "the full LND API (gRPC and
REST)" with no capability restrictions vs a self-managed LND node, so this
profile inherits `LndAdapter.capabilities` unchanged. If a future Voltage tier
restricts an LND RPC, override the capability surface at the
`assertBackendSupports` call site rather than forking the LND adapter.

## OpenNode

`@boltwall/adapters/opennode` implements a server-only adapter over OpenNode's
REST charge API. It creates Lightning-capable OpenNode charges with
`POST /v1/charges`, derives the Boltwall payment hash from the returned BOLT 11
invoice, and looks charges up with `GET /v2/charge/{id}`. The OpenNode charge
ID stays inside the adapter; middleware and proxy code continue to call
`lookupInvoice(paymentHash)`.

```ts
import { createOpenNodeAdapterFromEnv } from "@boltwall/adapters/opennode";

const backend = createOpenNodeAdapterFromEnv();
```

Or, with explicit configuration:

```ts
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";

const backend = new OpenNodeAdapter({
  apiKey: process.env.OPENNODE_API_KEY!,
  baseUrl: "https://dev-api.opennode.com",
});
```

### Configuration shape

- `OPENNODE_API_KEY` — API key from the OpenNode development or production
  dashboard. It is sent as the raw `Authorization` header value, per OpenNode's
  authentication docs.
- `OPENNODE_BASE_URL` — optional API base URL. Defaults to
  `https://api.opennode.com`. Use `https://dev-api.opennode.com` with
  development-environment keys.

`loadOpenNodeEnv` throws an `OpenNodeEnvError` that does not echo API key or
base URL values. `OpenNodeAdapter` requires HTTPS base URLs because OpenNode's
authentication docs require HTTPS for API requests.

### Capability flags

OpenNode's documented charge lifecycle is provider-state driven:
`unpaid`, `processing`, `underpaid`, `paid`, `expired`, and `refunded`. The
Lightning webhook statuses are `paid` and `expired`; the docs do not expose
HODL settlement, invoice cancellation, preimages, or a first-class invoice
subscription stream. The adapter therefore advertises:

| Capability          | Value   | Rationale                                            |
| ------------------- | ------- | ---------------------------------------------------- |
| HODL invoices       | `false` | No official OpenNode HODL/preimage settlement API.   |
| Invoice cancel      | `false` | No official charge cancellation endpoint is exposed. |
| Streaming invoices  | `false` | Webhooks exist, but no adapter-level stream API.     |
| Custom descriptions | `true`  | `description` is a documented create-charge field.   |

`OpenNodeAdapter#createInvoice({ hodl: true })` rejects at call time, and
`assertBackendSupports(adapter, { hodl: true })` rejects at boot time.

### Lookup persistence

OpenNode lookup is charge-ID centered, while Boltwall lookup is payment-hash
centered. The default adapter keeps a process-local `paymentHash -> chargeId`
map. Deployments that must survive restarts should inject a persistent
`OpenNodeChargeStore`; the provider charge ID still remains hidden from
middleware and proxy public APIs.

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

| Provider                 | Current constraint                                                                                                                                                                                                                                                                                                                                                | Adapter implication                                                                                                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LND / Voltage-hosted LND | LND exposes gRPC/REST invoice APIs with millisatoshi fields, HODL invoice settlement/cancel paths, invoice subscription streams, and settled preimages. Voltage-hosted LND is still LND from the adapter boundary. See Lightning Labs `AddInvoice`, `LookupInvoice`, `SubscribeInvoices`, `SettleInvoice`, and `CancelInvoice` RPC docs.                          | `kind: "lnd"` can advertise the full capability surface when configured against an LND node: HODL, cancel, streaming invoices, custom descriptions, millisatoshi-safe amounts, and preimages on settled invoices.                                                         |
| OpenNode                 | OpenNode's charge API is charge-ID centered and creates Lightning charges with `amount` plus currency, callback/webhook URLs, order metadata, and a returned Lightning invoice. The documented charge lifecycle is provider-state driven rather than HODL/preimage driven. See OpenNode "Creating a charge", "Charge info", "Charge lifecycle", and webhook docs. | `kind: "opennode"` advertises custom descriptions only. HODL, cancellation, and streaming are unsupported unless an official API adds them. The adapter retains the OpenNode charge ID internally so `lookupInvoice(paymentHash)` remains provider-neutral.               |
| BTCPay Server            | BTCPay Greenfield invoice APIs are store/invoice-ID centered. Lightning payment requests are exposed through payment-method data, and invoice transitions are usually observed by polling or webhooks. HODL settlement and settled preimage exposure are not a portable Greenfield invoice capability. See BTCPay Server Greenfield invoice and webhook docs.     | The BTCPay adapter should mark HODL/cancel/streaming as unsupported unless configured against a backend-specific feature that proves otherwise. It must retain the BTCPay invoice ID internally and map provider statuses to `open`, `settled`, `canceled`, or `expired`. |

Official references:

- OpenNode charge creation: <https://developers.opennode.com/docs/creating-a-charge>
- OpenNode API reference: <https://developers.opennode.com/reference>
- BTCPay Server ecommerce/Greenfield integration: <https://docs.btcpayserver.org/Development/ecommerce-integration-guide/>
- BTCPay Server Greenfield API: <https://docs.btcpayserver.org/API/Greenfield/v1/>
- Lightning Labs LND API: <https://api.lightning.community/>
- Voltage LND node product docs: <https://docs.voltage.cloud/>
- Voltage LND Node API (ports, connection, admin macaroon): <https://docs.voltage.cloud/lnd-node-api>
- Voltage REST API examples (URL template, header auth): <https://docs.voltage.cloud/rest-api-examples>
- Voltage gRPC API examples: <https://docs.voltage.cloud/grpc-api-examples>

Server-only boundary: network/payment-provider adapters are server runtime code.
Do not import concrete adapters from playground client components or any browser
bundle. Browser-facing code should depend on protocol helpers from
`@boltwall/l402` and test doubles from `@boltwall/adapters/testing` only.
