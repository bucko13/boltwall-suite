# @boltwall/adapters

Lightning backend adapters for Boltwall Suite.

New to L402? See the [project README](../../README.md#what-is-l402) for what
L402 is and how the packages fit together.

These packages are not yet published to npm. See the
[root quickstart](../../README.md#quickstart) for workspace setup.

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
fixtures from [`@boltwall/l402`](../l402/README.md) or a concrete backend adapter.

## Local LND

`@boltwall/adapters/lnd` accepts explicit `LndAdapterOptions`:

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

`OpenNodeAdapter#createInvoice({ hodl: true })` rejects at call time with an
`unsupported-feature` error, and `assertBackendSupports(adapter, { hodl: true })`
rejects at boot time. Passing `features.hodlInvoices` or
`features.streamingInvoices` as `true` to the constructor fails at boot for the
same reason, mirroring the BTCPay adapter.

### Lookup persistence

OpenNode lookup is charge-ID centered, while Boltwall lookup is payment-hash
centered. The default adapter keeps a process-local `paymentHash -> chargeId`
map. Deployments that must survive restarts should inject a persistent
`OpenNodeChargeStore`; the provider charge ID still remains hidden from
middleware and proxy public APIs.

## BTCPay Server

`@boltwall/adapters/btcpay` implements a server-only adapter over BTCPay
Server's Greenfield store Lightning API. It creates invoices with
`POST /api/v1/stores/{storeId}/lightning/{cryptoCode}/invoices`, looks them up
with `GET /api/v1/stores/{storeId}/lightning/{cryptoCode}/invoices/{id}`, and
keeps BTCPay's opaque invoice `id` inside the adapter. Middleware and proxy code
continue to use normalized `lookupInvoice(paymentHash)`.

```ts
import { createBtcPayAdapterFromEnv } from "@boltwall/adapters/btcpay";

const backend = createBtcPayAdapterFromEnv();
```

Or, with explicit configuration:

```ts
import { BtcPayAdapter } from "@boltwall/adapters/btcpay";

const backend = new BtcPayAdapter({
  baseUrl: process.env.BTCPAY_BASE_URL!,
  apiKey: process.env.BTCPAY_API_KEY!,
  storeId: process.env.BTCPAY_STORE_ID!,
});
```

### Configuration shape

- `BTCPAY_BASE_URL` — BTCPay Server origin, such as
  `https://btcpay.example`. Credentialed requests require HTTPS except for
  explicit localhost URLs used by local test deployments.
- `BTCPAY_API_KEY` — Greenfield API key sent as
  `Authorization: token <api-key>`, per the BTCPay eCommerce integration guide.
- `BTCPAY_STORE_ID` — store id whose Lightning node configuration will create
  invoices.
- `BTCPAY_CRYPTO_CODE` — optional Greenfield crypto code. Defaults to `BTC`.
- `BTCPAY_HODL_INVOICES` and `BTCPAY_STREAMING_INVOICES` — optional boolean
  feature flags. `true` currently fails at boot because the documented
  Greenfield store Lightning invoice schema does not expose those adapter
  behaviors.

The API key needs `btcpay.server.cancreatelightninginvoiceinternalnode` for
invoice creation and `btcpay.store.canviewlightninginvoice` for lookup.

`loadBtcPayEnv` throws a `BtcPayEnvError` that does not echo API keys or other
secret values.

### Capability flags

The documented Greenfield store Lightning invoice status enum is `Unpaid`,
`Paid`, and `Expired`. The adapter maps those to `open`, `settled`, and
`expired`, with an additional expiry-time check for stale `Unpaid` responses.
The API docs do not expose HODL settlement, invoice cancellation, or an adapter
level subscription stream, so the adapter advertises:

| Capability          | Value   | Rationale                                                |
| ------------------- | ------- | -------------------------------------------------------- |
| HODL invoices       | `false` | No documented HODL/preimage settlement request shape.    |
| Invoice cancel      | `false` | No documented store Lightning invoice cancel endpoint.   |
| Streaming invoices  | `false` | Polling/webhooks exist, but no adapter stream API.       |
| Custom descriptions | `true`  | `description` is documented in create Lightning invoice. |

`BtcPayAdapter#createInvoice({ hodl: true })` rejects at call time, and
`assertBackendSupports(adapter, { hodl: true })` rejects at boot time.

### Lookup persistence

BTCPay lookup is provider-invoice-ID centered, while Boltwall lookup is
payment-hash centered. The default adapter keeps a process-local
`paymentHash -> invoiceId` map. Deployments that must survive restarts should
persist that relation outside Boltwall; the BTCPay invoice ID still remains
hidden from middleware and proxy public APIs.

## Live integration tests

`@boltwall/adapters/test/integration/*.test.ts` exercises the OpenNode, BTCPay
Server, and Voltage-hosted LND adapters against real provider endpoints. The
tests are skipped by default and run only when their per-provider env vars are
set, so the package's regular `bun run test` stays clean and infrastructure-
free.

```sh
bun run --cwd packages/adapters test:integration
```

Without env vars set, every `describe` block is skipped and the suite reports
`0 fail / 3 skip`. Required env vars per adapter:

- **OpenNode** (`opennode.test.ts`): `OPENNODE_TEST_API_KEY` (required;
  development-environment key only); `OPENNODE_TEST_BASE_URL` (optional;
  override to `https://dev-api.opennode.com` for the developer-environment
  endpoint).
- **BTCPay Server** (`btcpay.test.ts`): `BTCPAY_TEST_BASE_URL`,
  `BTCPAY_TEST_API_KEY`, `BTCPAY_TEST_STORE_ID` (all required);
  `BTCPAY_TEST_CRYPTO_CODE` (optional, defaults to `BTC`).
- **Voltage LND** (`voltage-lnd.test.ts`): `VOLTAGE_TEST_LND_BASE_URL`,
  `VOLTAGE_TEST_LND_MACAROON`, `VOLTAGE_TEST_LND_CERT` (all required).

Test deployment policy:

- Use development-environment, testnet, or owner-provided staging credentials
  only. **Do not** spend mainnet sats — tests create invoices but do not pay
  them.
- Tests assert normalized adapter behavior (payment hash round-trip, status
  taxonomy) rather than provider-specific business names. Provider-specific
  capability gaps (e.g. no HODL on OpenNode/BTCPay default) are documented in
  the capability sections above.

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

| Provider                 | Current constraint                                                                                                           | Adapter implication                                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LND / Voltage-hosted LND | LND exposes gRPC/REST invoice APIs with HODL, cancel, streaming, and preimage settlement; Voltage-hosted LND is the same from the adapter boundary. | `kind: "lnd"` advertises the full capability surface: HODL, cancel, streaming invoices, custom descriptions, and preimages on settled invoices.                                                                   |
| OpenNode                 | OpenNode's charge lifecycle is provider-state driven, not HODL/preimage driven.                                              | `kind: "opennode"` advertises custom descriptions only; HODL, cancellation, and streaming are unsupported. The adapter retains the OpenNode charge ID so `lookupInvoice(paymentHash)` remains provider-neutral.   |
| BTCPay Server            | BTCPay's store Lightning API documents `Unpaid`, `Paid`, and `Expired` statuses only; HODL, cancellation, and streams are absent. | `kind: "btcpay"` advertises custom descriptions only; HODL, cancellation, and streaming are unsupported. The adapter retains the BTCPay invoice ID so `lookupInvoice(paymentHash)` remains provider-neutral.      |

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

Only `@boltwall/adapters/testing` is built to run in the browser. The concrete
adapters keep their workspace dependencies (such as `@boltwall/l402`) as bare
external imports, so importing one directly into a browser module graph fails to
resolve rather than silently shipping payment-provider code to a client bundle.
The browser import suite covers both the supported `MockAdapter` path and this
production adapter server-only surface.
