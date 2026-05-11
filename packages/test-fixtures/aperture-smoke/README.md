# Aperture Interop Notes

Phase 2 interop smoke is vector-only. It uses deterministic vectors from the
Lightning Labs Aperture `l402` library tests and source, so it runs in default
package tests without Docker, LND, live invoices, or secret root-key extraction.

The default smoke lives at:

```sh
bun test packages/l402/test/interop/aperture-smoke.test.ts
```

It covers:

- Aperture `EncodeIdentifierBytes` layout from `l402/identifier_test.go`.
- Aperture `SetHeader` / `FromHeader` Authorization scheme behavior from
  `l402/header.go`.
- Aperture caveat parser vectors from `l402/caveat_test.go`.
- Aperture services/capabilities/timeout/unknown-caveat verification behavior
  from `l402/satisfier_test.go` and `l402/caveat_test.go`.

## Live Server Fixture

The Docker files in this directory are not a Phase 2 gate. They are retained as
a draft for the later live-server compatibility pass, when end-to-end validation
can run against real Aperture, Docker, and regtest LND together.

1. Start or reuse a regtest LND whose RPC port is reachable from Docker as
   `host.docker.internal:10009`.
2. Export the LND material Aperture needs:

   ```sh
   export LND_TLS_CERT=/absolute/path/to/lnd/tls.cert
   export LND_MACAROON_DIR=/absolute/path/to/lnd/data/chain/bitcoin/regtest
   ```

3. Start the fixture:

   ```sh
   docker compose -f packages/test-fixtures/aperture-smoke/docker-compose.yml up --build
   ```

4. Request a challenge:

   ```sh
   curl -i http://localhost:8081/pokemon/1
   ```

The fixture intentionally uses `insecure: true` for localhost-only manual
testing. Production deployments must use TLS because L402 credentials are bearer
tokens transmitted in HTTP headers.
