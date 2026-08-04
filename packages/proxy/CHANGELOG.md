# @boltwall/proxy

## 0.2.1

### Patch Changes

- 844d03f: Fix the published `boltwall` bin so symlinked package-manager launchers run the CLI instead of exiting silently.
- a1aa932: Include adapter runtime `.proto` and `.wasm` assets in every generated Vercel function while the generated API eagerly imports all Lightning adapters, fixing NWC deployments that crashed before route handling when Vercel omitted `tiny-secp256k1`'s WASM file.

## 0.2.0

### Minor Changes

- 1c0718a: Add a proof-of-concept Nostr Wallet Connect backend adapter and proxy deployment support for `LN_BACKEND=nwc`.

  The adapter reads `NWC_CONNECTION_STRING` as bearer secret material, creates and looks up standard invoices through NWC, and keeps HODL/cancel/streaming capabilities disabled until those paths are validated against target wallet services.

### Patch Changes

- Updated dependencies [1c0718a]
  - @boltwall/adapters@0.3.0
  - @boltwall/middleware@0.1.4

## 0.1.3

### Patch Changes

- 7de0ffa: Fix the issues that stopped an LND proxy from working on Vercel:

  - **Boot crash** with `ENOENT: open '.../lightning/grpc/protos/autopilot.proto'`. `lightning` reads its gRPC `.proto` definitions (and `tiny-secp256k1` its `secp256k1.wasm`) from disk at runtime, and Vercel's file tracer does not follow those reads, so the assets were dropped from the bundle. The generated `vercel.json` now declares `functions["api/index.ts"].includeFiles` with a glob that pulls them into the function.
  - **Every request returning 400.** Vercel terminates TLS at the edge and forwards to the function over plain HTTP, so Express reported `req.protocol === "http"` and the L402 middleware refused every request as non-TLS. The generated app now calls `app.set("trust proxy", true)` so `req.protocol` reflects the original `X-Forwarded-Proto`.
  - **TLS cert handling.** `lightning` expects the TLS cert base64/hex-encoded, so a raw PEM `LND_TLS_CERT` decoded to garbage and failed the handshake; the generated app now base64-encodes a PEM value automatically. The cert is also now **optional**: a self-hosted node's self-signed cert is used as the gRPC CA when provided, but managed nodes (e.g. Voltage) serve a publicly-trusted cert, for which the cert is omitted and the connection is verified against Node's system root certificates.
  - **`400 Bad Request` from CDN-fronted upstreams on every forwarded request.** When a `forwardHeaders.allow` list was configured, the header policy stripped the `Host` header (`changeOrigin` sets it, but it was not in the allow-list), so the forwarded HTTP/1.1 request had no `Host` and upstreams behind a CDN (e.g. Cloudflare) rejected it with `400`. The `Host` header is now exempt from the allow/deny policy.

- Updated dependencies [7de0ffa]
  - @boltwall/adapters@0.2.0
  - @boltwall/middleware@0.1.3

## 0.1.2

### Patch Changes

- e63af19: Fix several LND-on-Vercel deploy issues:

  - The interactive secret prompt now captures multi-line TLS certificate chains (leaf + intermediates) instead of truncating to the first line.
  - The generated Vercel `api/index.ts` typechecks during the Vercel build (`hodl` stays the literal `true`, and `EnvRootKeyStore` is declared before it is used).
  - Sibling `@boltwall/*` package versions resolve under the deployed dist layout, not just the source layout.
  - The generated app forces `tiny-secp256k1`'s `secp256k1.wasm` into the Vercel bundle for LND backends (via a `new URL(..., import.meta.url)` asset hint), avoiding a runtime ENOENT the file tracer otherwise causes.

- 2d0714d: Add CORS origin pattern support for dynamic preview deployment origins.
- Updated dependencies [e63af19]
  - @boltwall/l402@0.1.2
  - @boltwall/adapters@0.1.2
  - @boltwall/middleware@0.1.2

## 0.1.1

### Patch Changes

- c0abf2d: Publish the first public Boltwall package versions.
- Updated dependencies [c0abf2d]
  - @boltwall/l402@0.1.1
  - @boltwall/adapters@0.1.1
  - @boltwall/middleware@0.1.1
