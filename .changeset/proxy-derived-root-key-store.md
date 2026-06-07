---
"@boltwall/proxy": minor
---

Add `DerivedRootKeyStore`, a restart-safe root-key store that derives per-token L402 macaroon root keys as `HMAC-SHA256(secret, tokenId)` from the `BOLTWALL_PROXY_ROOT_KEY` deployment secret — the same contract the generated Vercel app already uses, now exported for saved-config runtimes, programmatic embedding, and Docker deployments. `toProxyConfig` selects it automatically when the variable is set (falling back to an in-memory store for dev/demo runs) and fails fast on malformed secrets without echoing the value. `boltwall dev` reports which store is active.
