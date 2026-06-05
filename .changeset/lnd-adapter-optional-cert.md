---
"@boltwall/adapters": minor
---

Make `LndAdapter`'s TLS certificate optional. Provide a self-hosted node's self-signed certificate (a PEM, or its base64/hex encoding — a raw PEM is now normalized for you) to use it as the gRPC CA. Omit it for a node served with a publicly-trusted certificate (e.g. a managed provider like Voltage, whose endpoints use a Let's Encrypt certificate): the adapter then verifies the connection against Node's system root certificates, rather than a custom CA that would reject the server's certificate with `unable to get issuer certificate`. The previous behavior — passing a node's own cert as the only trusted CA — failed against such providers.
