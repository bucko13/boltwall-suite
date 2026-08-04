---
"@boltwall/adapters": minor
"@boltwall/proxy": minor
---

Add a proof-of-concept Nostr Wallet Connect backend adapter and proxy deployment support for `LN_BACKEND=nwc`.

The adapter reads `NWC_CONNECTION_STRING` as bearer secret material, creates and looks up standard invoices through NWC, and keeps HODL/cancel/streaming capabilities disabled until those paths are validated against target wallet services.
