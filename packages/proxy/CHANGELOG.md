# @boltwall/proxy

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
