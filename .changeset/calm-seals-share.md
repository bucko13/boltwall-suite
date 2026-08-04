---
"@boltwall/proxy": patch
---

Include adapter runtime `.proto` and `.wasm` assets in every generated Vercel function while the generated API eagerly imports all Lightning adapters, fixing NWC deployments that crashed before route handling when Vercel omitted `tiny-secp256k1`'s WASM file.
