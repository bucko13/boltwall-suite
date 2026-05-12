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
- `LND_CERT_BASE64` (base64 of TLS cert PEM bytes)
- `LND_MACAROON_BASE64` (base64 of admin macaroon bytes)

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
export LND_CERT_BASE64="<base64-cert>"
export LND_MACAROON_BASE64="<base64-macaroon>"
```

## Typed Env Plan (zod)

For local helper scripts and future automation, parse env with zod instead of
reading `process.env` ad hoc.

```ts
import { z } from "zod";

export const LndEnvSchema = z.object({
  LND_SOCKET: z.string().min(1),
  LND_CERT_BASE64: z.string().min(1),
  LND_MACAROON_BASE64: z.string().min(1),
});

export type LndEnv = z.infer<typeof LndEnvSchema>;
export const lndEnv = LndEnvSchema.parse(process.env);
```

This should be the default for scriptable local verification once we implement
agent-driven Polar/LND checks.
