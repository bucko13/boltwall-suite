# @boltwall/l402

## 0.1.2

### Patch Changes

- e63af19: Fix a runtime crash when the ESM bundle is deployed to runtimes without a CommonJS loader (e.g. Vercel's serverless runtime). The bundled CJS dependencies (macaroon, sjcl, tweetnacl) compile to `require(...)` calls, which tsup's ESM output replaced with a `__require` shim that threw "Dynamic require of crypto is not supported".

  The package now ships environment-split builds resolved via export conditions: the `node` build re-binds `require` via `createRequire(import.meta.url)` so those dependencies resolve node builtins, while the browser/`default` build is unchanged and never references `node:module` (so it keeps loading in browser bundlers such as the playground's webpack build).

## 0.1.1

### Patch Changes

- c0abf2d: Publish the first public Boltwall package versions.
