---
"@boltwall/proxy": patch
---

Fix the issues that stopped an LND proxy from working on Vercel:

- **Boot crash** with `ENOENT: open '.../lightning/grpc/protos/autopilot.proto'`. `lightning` reads its gRPC `.proto` definitions (and `tiny-secp256k1` its `secp256k1.wasm`) from disk at runtime, and Vercel's file tracer does not follow those reads, so the assets were dropped from the bundle. The generated `vercel.json` now declares `functions["api/index.ts"].includeFiles` with a glob that pulls them into the function.
- **Every request returning 400.** Vercel terminates TLS at the edge and forwards to the function over plain HTTP, so Express reported `req.protocol === "http"` and the L402 middleware refused every request as non-TLS. The generated app now calls `app.set("trust proxy", true)` so `req.protocol` reflects the original `X-Forwarded-Proto`.
- **TLS cert handling.** `lightning` expects the TLS cert base64/hex-encoded, so a raw PEM `LND_TLS_CERT` decoded to garbage and failed the handshake; the generated app now base64-encodes a PEM value automatically. The cert is also now **optional**: a self-hosted node's self-signed cert is used as the gRPC CA when provided, but managed nodes (e.g. Voltage) serve a publicly-trusted cert, for which the cert is omitted and the connection is verified against Node's system root certificates.
- **`400 Bad Request` from CDN-fronted upstreams on every forwarded request.** When a `forwardHeaders.allow` list was configured, the header policy stripped the `Host` header (`changeOrigin` sets it, but it was not in the allow-list), so the forwarded HTTP/1.1 request had no `Host` and upstreams behind a CDN (e.g. Cloudflare) rejected it with `400`. The `Host` header is now exempt from the allow/deny policy.
