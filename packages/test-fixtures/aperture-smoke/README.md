# Aperture Smoke Fixture

This fixture is an opt-in manual smoke harness for `bw-1dl.11`. It is not part
of default CI because it needs Docker, a local regtest LND, and outbound access
to build Lightning Labs' Aperture reference implementation.

The smoke covers the two Phase 2 interop questions:

- Aperture-minted macaroon bytes can be verified by `@boltwall/l402`.
- A `@boltwall/l402`-minted credential can be presented to an Aperture-protected
  endpoint when the matching root key has been preloaded into the same Aperture
  root-key store.

## Run

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

5. Pay the returned invoice with the same regtest Lightning setup and capture:
   - the `WWW-Authenticate` macaroon value
   - the payment preimage
   - the 32-byte root key Aperture stored for that macaroon token id

6. Run the package smoke test:

   ```sh
   APERTURE_SMOKE=1 \
   APERTURE_SMOKE_MACAROON_B64=<challenge-macaroon> \
   APERTURE_SMOKE_ROOT_KEY_HEX=<aperture-root-key> \
   APERTURE_SMOKE_PREIMAGE_HEX=<payment-preimage> \
   APERTURE_SMOKE_URL=http://localhost:8081/pokemon/1 \
   bun test packages/l402/test/interop/aperture-smoke.test.ts
   ```

For the reverse-direction test, preload Aperture with the root key and token id
that the Bun test reports in its failure message, then rerun with:

```sh
APERTURE_SMOKE_EXPECT_APERTURE_ACCEPTS_BOLTWALL=1
```

The fixture intentionally uses `insecure: true` for localhost-only manual
testing. Production deployments must use TLS because L402 credentials are bearer
tokens transmitted in HTTP headers.
