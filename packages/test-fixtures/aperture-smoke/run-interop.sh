#!/usr/bin/env bash
# run-interop.sh — orchestrates the Aperture interop stack (bw-9zp.1).
#
# Usage:
#   ./run-interop.sh            Run full interop: wait, test, capture artifacts.
#   ./run-interop.sh --wait-only  Wait for Aperture readiness only (used by CI
#                                 to split the wait step from the test step).
#
# Environment:
#   APERTURE_URL   Base URL for Aperture (default: http://localhost:8081)
#   APERTURE_INTEROP  Must be "1" for tests to run (guards against accidental
#                     execution outside interop context).

set -euo pipefail

APERTURE_URL="${APERTURE_URL:-http://localhost:8081}"
COMPOSE_FILE="$(dirname "$0")/docker-compose.yml"
CAPTURED_DIR="$(dirname "$0")/captured"
LOGS_DIR="$(dirname "$0")/logs"
WAIT_ONLY="${1:-}"
MAX_WAIT=60

mkdir -p "$CAPTURED_DIR" "$LOGS_DIR"

wait_for_aperture() {
  echo "Waiting for Aperture at $APERTURE_URL …"
  local elapsed=0
  until curl -sf -o /dev/null -w "%{http_code}" "$APERTURE_URL/health" 2>/dev/null | grep -qE "^(200|404|402)$"; do
    if (( elapsed >= MAX_WAIT )); then
      echo "Aperture did not become ready within ${MAX_WAIT}s." >&2
      docker compose -f "$COMPOSE_FILE" logs aperture >> "$LOGS_DIR/aperture.log" 2>&1 || true
      exit 1
    fi
    sleep 2
    (( elapsed += 2 ))
  done
  echo "Aperture ready after ${elapsed}s."
}

capture_artifacts() {
  echo "Capturing Aperture logs …"
  docker compose -f "$COMPOSE_FILE" logs aperture >> "$LOGS_DIR/aperture.log" 2>&1 || true
  docker compose -f "$COMPOSE_FILE" logs backend >> "$LOGS_DIR/backend.log" 2>&1 || true
}

wait_for_aperture

if [[ "$WAIT_ONLY" == "--wait-only" ]]; then
  exit 0
fi

# Run the interop tests and capture artifacts on either outcome.
export APERTURE_INTEROP=1
if bun test packages/l402/test/interop/aperture-pr.test.ts; then
  capture_artifacts
  echo "Interop tests passed."
else
  capture_artifacts
  echo "Interop tests FAILED — see logs/ and captured/ directories." >&2
  exit 1
fi
