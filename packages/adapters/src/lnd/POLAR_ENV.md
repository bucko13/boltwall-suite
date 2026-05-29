# Polar Env Configuration (Local Reproducibility)

Use an env file for local Polar/LND verification. Keep shell `export` as an
optional fallback.

## Recommended Local Pattern

1. Copy an example file:

```bash
cp packages/adapters/src/lnd/.env.polar.example packages/adapters/src/lnd/.env.polar.local
```

2. Fill values from your Polar node:

- `LND_SOCKET` (for example `127.0.0.1:10009`)
- `LND_TLS_CERT` (base64 of TLS cert PEM bytes)
- `LND_MACAROON` (base64 of admin macaroon bytes)

3. Load env values before running verification:

```bash
set -a
source packages/adapters/src/lnd/.env.polar.local
set +a
```

Security:

- Do not commit `.env.polar.local`.
- Do not commit raw/base64 certs or macaroons.
- Do not print credential values in logs or CI output.

## Optional Shell-Export Fallback

When needed (CI, ephemeral shells), direct exports are still valid:

```bash
export LND_SOCKET="127.0.0.1:10009"
export LND_TLS_CERT="<base64-cert>"
export LND_MACAROON="<base64-macaroon>"
```
