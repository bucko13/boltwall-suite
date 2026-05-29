# BTCPay Testnet Adapter Notes

The BTCPay adapter is implemented from the official Greenfield API docs:

- Greenfield API v1: https://docs.btcpayserver.org/API/Greenfield/v1/
- Greenfield API example: https://docs.btcpayserver.org/Development/GreenFieldExample/
- eCommerce integration guide: https://docs.btcpayserver.org/Development/ecommerce-integration-guide/

Required API key permissions for this adapter:

- `btcpay.server.cancreatelightninginvoiceinternalnode` for `POST /api/v1/stores/{storeId}/lightning/{cryptoCode}/invoices`
- `btcpay.store.canviewlightninginvoice` for `GET /api/v1/stores/{storeId}/lightning/{cryptoCode}/invoices/{id}`

The Authorization header is `Authorization: token <api-key>`.

The adapter keeps BTCPay's opaque Lightning invoice `id` private and maps it
from the normalized payment hash returned by BTCPay. A process restart loses
that in-memory map, so production deployments that need lookup across restarts
should persist the payment-hash to provider-id relation outside Boltwall.

HODL invoices, invoice cancellation, and invoice streaming are not supported by this adapter.

Skipped-by-default integration tests use these variables:

```sh
BTCPAY_TEST_BASE_URL=https://btcpay.example
BTCPAY_TEST_API_KEY=...
BTCPAY_TEST_STORE_ID=...
BTCPAY_TEST_CRYPTO_CODE=BTC
```

Then run:

```sh
bun run --cwd packages/adapters test:integration
```
