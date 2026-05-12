#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.smoke.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not found on PATH" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required but unavailable" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required but not found on PATH" >&2
  exit 1
fi

echo "Starting regtest topology..."
docker compose -f "$COMPOSE_FILE" up -d

echo "Waiting for lnd-alice admin.macaroon..."
for i in $(seq 1 120); do
  if docker compose -f "$COMPOSE_FILE" exec -T lnd-alice sh -lc "test -f /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon"; then
    break
  fi
  if [ "$i" -eq 120 ]; then
    echo "Timed out waiting for lnd-alice credentials." >&2
    echo "Wallet initialization likely has not run yet." >&2
    echo "Run once in another terminal:" >&2
    echo "  docker compose -f $COMPOSE_FILE exec lnd-alice lncli --network=regtest create" >&2
    echo "Then rerun this script." >&2
    docker compose -f "$COMPOSE_FILE" logs lnd-alice >&2 || true
    exit 1
  fi
  sleep 1
done

export LND_SOCKET="${LND_SOCKET:-127.0.0.1:10009}"
export LND_CERT_BASE64="$(docker compose -f "$COMPOSE_FILE" exec -T lnd-alice sh -lc "base64 < /root/.lnd/tls.cert | tr -d '\n'")"
export LND_MACAROON_BASE64="$(docker compose -f "$COMPOSE_FILE" exec -T lnd-alice sh -lc "base64 < /root/.lnd/data/chain/bitcoin/regtest/admin.macaroon | tr -d '\n'")"

echo "Exported LND env vars for adapter smoke."
echo "Running adapter tests..."
bun run test --filter @boltwall/adapters

cat <<EOF
Smoke harness environment exported in current shell process only:
  LND_SOCKET
  LND_CERT_BASE64
  LND_MACAROON_BASE64

Topology remains running for manual payment/channel exercises.
Teardown:
  docker compose -f $COMPOSE_FILE down -v
EOF
