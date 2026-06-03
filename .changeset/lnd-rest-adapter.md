---
"@boltwall/adapters": minor
---

Add `LndRestAdapter` (exported from `@boltwall/adapters/lnd/rest`), an LND backend that talks to the node's REST API over plain HTTPS instead of gRPC. Unlike the gRPC `LndAdapter`, it pulls in no `lightning`/`tiny-secp256k1` dependency, so it loads on runtimes that cannot bundle that package's wasm or its dynamic `require("crypto")` — notably serverless functions.

It implements the invoice operations an L402 paywall needs (create invoice, look up settlement state) using the `Grpc-Metadata-macaroon` auth header and the node's TLS certificate as a CA. HODL invoices, cancellation, and streaming are intentionally not advertised, so `assertBackendSupports` rejects configurations that require them.
