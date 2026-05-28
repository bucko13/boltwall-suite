# Deprecated Proxy Vercel Template

This workspace is no longer the public or primary Vercel deployment path for
Boltwall.

Use the installable `@boltwall/proxy` CLI instead:

```sh
bun add --global @boltwall/proxy
boltwall deploy
boltwall deploy --config ./boltwall.yaml --yes
```

The CLI owns the v1 deployment experience because it can guide backend-specific
configuration for `lnd`, `voltage-lnd`, `opennode`, and `btcpay`; validate
JSON/YAML config; collect secrets without silently writing them to disk; map
those secrets to Vercel environment variables; and generate the Vercel project
shape from package-owned code.

Direct Vercel Deploy Button prompts are static and cannot express that
conditional secret/config workflow safely. Do not link users here as the v1
deployment path, and do not add new template-only behavior.

This workspace remains only for compatibility with older local template checks.
Useful deploy-shape assertions belong in `@boltwall/proxy` tests.
