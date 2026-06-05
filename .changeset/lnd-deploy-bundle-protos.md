---
"@boltwall/proxy": patch
---

Fix two issues that stopped an LND proxy from working on Vercel:

- **Boot crash** with `ENOENT: open '.../lightning/grpc/protos/autopilot.proto'`. The `lightning` package reads its gRPC `.proto` definitions from disk at runtime, and Vercel's file tracer does not follow those reads, so the protos were dropped from the bundle — the same failure mode as the previously fixed `secp256k1.wasm`. The generated `api/index.ts` now references every `lightning/grpc/protos/*.proto` (alongside the wasm) via `new URL(<literal>, import.meta.url)`, which the tracer does follow, forcing the assets into the function.
- **Every request returning 400.** Vercel terminates TLS at the edge and forwards to the function over plain HTTP, so Express reported `req.protocol === "http"` and the L402 middleware refused every request as non-TLS. The generated app now calls `app.set("trust proxy", true)` so `req.protocol` reflects the original `X-Forwarded-Proto`, and the proxy issues its 402 challenge as expected.
