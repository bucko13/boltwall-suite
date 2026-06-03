---
"@boltwall/proxy": patch
---

Fix an LND Vercel deploy crashing at boot with `ENOENT: open '.../lightning/grpc/protos/autopilot.proto'`. The `lightning` package reads its gRPC `.proto` definitions from disk at runtime, and Vercel's file tracer does not follow those reads, so the protos were dropped from the bundle — the same failure mode as the previously fixed `secp256k1.wasm`. The generated `api/index.ts` now references every `lightning/grpc/protos/*.proto` (alongside the wasm) via `new URL(<literal>, import.meta.url)`, which the tracer does follow, forcing the assets into the function.
