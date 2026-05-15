# Boltwall Vercel Proxy Template

Deploy an Express `@boltwall/proxy` Vercel Function in front of an existing
HTTP API. Unpaid protected requests receive a dual LSAT/L402 `402` challenge by
default, and paid retries are forwarded to the upstream service.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fboltwall%2Fboltwall-suite&root-directory=templates%2Fproxy-vercel&project-name=boltwall-proxy&env=TARGET_URL,LN_BACKEND,DEFAULT_PRICE_MSAT,CHALLENGE_COMPATIBILITY,LND_SOCKET,LND_TLS_CERT,LND_MACAROON,VOLTAGE_LND_BASE_URL,VOLTAGE_LND_MACAROON,VOLTAGE_LND_CERT,OPENNODE_API_KEY,OPENNODE_BASE_URL,BTCPAY_BASE_URL,BTCPAY_API_KEY,BTCPAY_STORE_ID,BTCPAY_CRYPTO_CODE&envDescription=Boltwall%20proxy%20target%2C%20pricing%2C%20and%20selected%20Lightning%20backend%20credentials.)

## Deploy Paths

Direct button:

1. Click **Deploy with Vercel**.
2. Set `TARGET_URL`, `LN_BACKEND`, `DEFAULT_PRICE_MSAT`, and only the secret
   variables for the selected backend.
3. Deploy. Vercel provides TLS for the public proxy URL.

CLI flow:

```sh
boltwall deploy vercel
boltwall deploy vercel --config ./boltwall.yaml --yes
```

Maintainer smoke from this directory:

```sh
vercel deploy
```

Vercel's Deploy Button uses `repository-url` plus `root-directory`, which is the
documented monorepo template path. Vercel CLI can deploy from this project root
or with `vercel --cwd templates/proxy-vercel`.

## Required Environment

All deployments need:

- `TARGET_URL` - upstream origin, for example `https://pokeapi.co/api/v2`.
- `LN_BACKEND` - `lnd`, `voltage-lnd`, `opennode`, or `btcpay`.
- `DEFAULT_PRICE_MSAT` - default protected-route price in millisatoshis.

Optional:

- `CHALLENGE_COMPATIBILITY` - `dual`, `l402-only`, or `lsat-only`. Defaults to
  `dual`, preserving the LSAT-first/L402-second compatibility challenge.
- `SERVICE` - macaroon service caveat value. Defaults to the target host.
- `UNPROTECTED_PATHS` - comma-separated paths that bypass payment, for example
  `/healthz,/robots.txt`.
- `FORWARD_ALLOW` - comma-separated upstream header allow patterns.
- `FORWARD_DENY` - comma-separated upstream header deny patterns.
- `UPSTREAM_TIMEOUT_MS` - positive upstream timeout in milliseconds.

## Backends

### LND

Set:

- `LND_SOCKET` - LND gRPC socket, for example `host:10009`.
- `LND_TLS_CERT` - TLS certificate value.
- `LND_MACAROON` - macaroon hex value.

### Voltage LND

Set:

- `VOLTAGE_LND_BASE_URL` - Voltage node URL or host. REST port `8080` is
  normalized to the LND gRPC port by `@boltwall/adapters/voltage-lnd`.
- `VOLTAGE_LND_MACAROON` - admin macaroon hex value.
- `VOLTAGE_LND_CERT` - TLS certificate value.

### OpenNode

Set:

- `OPENNODE_API_KEY`
- `OPENNODE_BASE_URL` if overriding the provider default.

The template validates these variables, but this repository version does not
yet include a concrete `OpenNodeAdapter` export. Selecting `LN_BACKEND=opennode`
fails fast with a redacted startup error until that adapter lands.

### BTCPay Server

Set:

- `BTCPAY_BASE_URL`
- `BTCPAY_API_KEY`
- `BTCPAY_STORE_ID`
- `BTCPAY_CRYPTO_CODE` if not `BTC`.
- `BTCPAY_HODL_INVOICES` and `BTCPAY_STREAMING_INVOICES` only after verifying
  those features in your deployment.

The template validates these variables, but this repository version does not
yet include a concrete `BtcPayAdapter` export. Selecting `LN_BACKEND=btcpay`
fails fast with a redacted startup error until that adapter lands.

## Config File Shape

`boltwall.example.yaml` is the config shape consumed by the `boltwall deploy
vercel` CLI flow:

```yaml
name: pokedex-proxy
targetUrl: https://pokeapi.co/api/v2
backend:
  kind: voltage-lnd
  envPrefix: VOLTAGE_LND
pricing:
  defaultPriceMsat: "1000"
routes:
  - path: /pokemon/*
    methods: [GET]
    priceMsat: "1000"
challengeCompatibility: dual
```

Saved configs should store secret references such as env var names or Vercel
secret names, not raw backend credentials.

## Security Notes

Vercel provides TLS for the deployed proxy URL. For production, also point
`TARGET_URL` at an HTTPS upstream so protected responses are not fetched over
cleartext between Vercel and your API.

Store backend credentials as Vercel environment variables. Do not commit
macaroons, API keys, TLS certificates, preimages, invoices with sensitive
metadata, or `.env` files. Validation errors mention variable names and reasons
without echoing secret values.

The default `InMemoryRootKeyStore` is suitable for demos and single-instance
smokes. Production deployments that need credentials to survive cold starts or
instance changes should replace it with a durable `RootKeyStore` implementation.
