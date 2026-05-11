# Protocol Compatibility

This document tracks observed compatibility between Boltwall Suite and external
L402 implementations. It records smoke coverage and known gaps; the live L402
spec remains authoritative for protocol behavior.

## Aperture Manual Smoke

Task: `bw-1dl.11`

Reference:

- L402 protocol-specification.md §5 The L402 Authentication Scheme
- L402 protocol-specification.md §6 HTTP Protocol Flow
- L402 protocol-specification.md §9.1 Transport Security
- L402 protocol-specification.md §10 Backwards Compatibility
- L402 macaroon-spec.md §Identifier Structure
- L402 macaroon-spec.md §Minting
- L402 macaroon-spec.md §Verification
- L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary Format
- Aperture reference paths: `sample-conf.yaml`, `l402/header.go`

| Surface                | Aperture behavior                                                                                                                          | Boltwall behavior                                                                                                     | Smoke status                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Challenge scheme       | Issues `WWW-Authenticate` L402 challenges for protected HTTP resources.                                                                    | Parses and emits L402 challenges through the root package helpers.                                                    | Fixture recipe captures an Aperture challenge; default CI does not run the Docker smoke.                    |
| Authorization scheme   | Accepts `Authorization: LSAT ...` and `Authorization: L402 ...`; Aperture `SetHeader` emits LSAT first then L402 for legacy compatibility. | Accepts both schemes; emits L402 by default and LSAT when legacy mode is requested.                                   | Covered by unit fixtures; manual smoke uses L402 for the retry.                                             |
| Macaroon serialization | Uses base64-encoded V2 binary macaroons in HTTP Authorization credentials.                                                                 | Mints and verifies base64-encoded V2 binary macaroons via the private codec.                                          | Opt-in smoke verifies captured Aperture macaroon bytes with `verifyMacaroon`.                               |
| Identifier shape       | Uses version 0 identifiers containing payment hash and token id.                                                                           | Encodes and decodes version 0 identifiers as two-byte big-endian version, 32-byte payment hash, and 32-byte token id. | Opt-in smoke decodes the captured token id to preload an in-memory root key store.                          |
| Root key lookup        | Stores root keys server-side and never sends them to clients.                                                                              | `RootKeyStore` is server-side only and keyed by token id.                                                             | Manual smoke requires operator capture/preload of test-only root keys; no production secrets are committed. |
| Payment proof          | Verifies the SHA-256 preimage relation to the identifier payment hash.                                                                     | `verifyMacaroon` checks preimage binding after signature verification.                                                | Opt-in smoke passes Aperture's paid preimage into Boltwall verification.                                    |
| Unknown caveats        | The L402 macaroon spec says unknown caveats are skipped.                                                                                   | Unknown caveats are skipped by default, with explicit strict mode available for audits.                               | Unit covered; manual smoke should declare satisfiers only for caveats under test.                           |
| TLS                    | Production Aperture deployments require TLS; local examples may use insecure mode.                                                         | Documentation requires TLS for deployment paths and treats credentials as bearer tokens.                              | Fixture uses `insecure: true` only for localhost manual smoke.                                              |

## Current Gaps

- The Aperture smoke is intentionally manual until Phase 8 lands the full
  nightly compatibility workflow.
- Reverse-direction acceptance depends on preloading Aperture's test root-key
  store with a Boltwall-minted token id and root key. The opt-in test can drive
  the request once that setup is done, but the repository does not commit
  root-key material or Aperture database state.
