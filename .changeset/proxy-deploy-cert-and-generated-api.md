---
"@boltwall/proxy": patch
---

Fix several LND-on-Vercel deploy issues:

- The interactive secret prompt now captures multi-line TLS certificate chains (leaf + intermediates) instead of truncating to the first line.
- The generated Vercel `api/index.ts` typechecks during the Vercel build (`hodl` stays the literal `true`, and `EnvRootKeyStore` is declared before it is used).
- Sibling `@boltwall/*` package versions resolve under the deployed dist layout, not just the source layout.
- The generated app forces `tiny-secp256k1`'s `secp256k1.wasm` into the Vercel bundle for LND backends (via a `new URL(..., import.meta.url)` asset hint), avoiding a runtime ENOENT the file tracer otherwise causes.
