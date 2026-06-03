---
"@boltwall/l402": patch
---

Fix a runtime crash when the ESM bundle is deployed to runtimes without a CommonJS loader (e.g. Vercel's serverless runtime). The bundled CJS dependencies (macaroon, sjcl, tweetnacl) compile to `require(...)` calls, which tsup's ESM output replaced with a `__require` shim that threw "Dynamic require of crypto is not supported". The build now re-binds `require` via `createRequire(import.meta.url)` so those dependencies resolve node builtins at runtime.
