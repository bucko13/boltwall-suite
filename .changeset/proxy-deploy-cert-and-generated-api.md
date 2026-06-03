---
"@boltwall/proxy": patch
---

Fix two deploy issues: the interactive secret prompt now captures multi-line TLS certificate chains (leaf + intermediates) instead of truncating to the first line, and the generated Vercel `api/index.ts` typechecks during the Vercel build (`hodl` stays the literal `true`, and `EnvRootKeyStore` is declared before it is used).
