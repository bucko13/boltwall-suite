# Protocol Compatibility

This document tracks observed compatibility between Boltwall Suite and external
L402 implementations. It records smoke coverage and known gaps; the live L402
spec remains authoritative for protocol behavior.

## Aperture Vector Smoke

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
- Aperture reference paths: `l402/identifier.go`, `l402/identifier_test.go`,
  `l402/header.go`, `l402/caveat_test.go`, `l402/satisfier_test.go`

| Surface                | Aperture behavior                                                                                                                          | Boltwall behavior                                                                                                     | Smoke status                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Authorization scheme   | Accepts `Authorization: LSAT ...` and `Authorization: L402 ...`; Aperture `SetHeader` emits LSAT first then L402 for legacy compatibility. | Accepts both schemes; emits L402 by default and LSAT when legacy mode is requested.                                   | Default-running vector smoke parses both header shapes.                                         |
| Macaroon serialization | Uses base64-encoded V2 binary macaroons in HTTP Authorization credentials.                                                                 | Mints and verifies base64-encoded V2 binary macaroons via the private codec.                                          | Default-running vector smoke mints, serializes, decodes, and verifies deterministic macaroons.  |
| Identifier shape       | Uses version 0 identifiers containing payment hash and token id.                                                                           | Encodes and decodes version 0 identifiers as two-byte big-endian version, 32-byte payment hash, and 32-byte token id. | Default-running vector smoke matches Aperture's `[1..32]` payment hash and `[32..1]` token id.  |
| Payment proof          | Verifies the SHA-256 preimage relation to the identifier payment hash.                                                                     | `verifyMacaroon` checks preimage binding after signature verification.                                                | Default-running vector smoke verifies a deterministic preimage-bound macaroon.                  |
| Caveat parsing         | Splits caveats at the first `=`; values may contain later `=` bytes.                                                                       | `parseCaveat` splits at the first `=` and preserves later `=` bytes in the value.                                     | Default-running vector smoke covers `expiration=1337`, `expiration=1337=`, and malformed input. |
| Unknown caveats        | Aperture `VerifyCaveats` ignores caveats when no matching satisfier exists.                                                                | Unknown caveats are skipped by default, with explicit strict mode available for audits.                               | Default-running vector smoke includes an unknown caveat next to known satisfiers.               |
| Timeout caveats        | Aperture timeout satisfiers use `<service>_valid_until` with Unix seconds and require later caveats to be earlier or equal.                | Callers can register a matching satisfier; the core verifier enforces repeated-caveat attenuation order.              | Default-running vector smoke registers an Aperture-shaped timeout satisfier.                    |
| TLS                    | Production Aperture deployments require TLS; local examples may use insecure mode.                                                         | Documentation requires TLS for deployment paths and treats credentials as bearer tokens.                              | Live-server TLS behavior is deferred to final end-to-end validation.                            |

## Current Gaps

- The Phase 2 smoke is intentionally vector-only. It does not stand up an
  Aperture server, pay invoices, or inspect Aperture's live root-key store.
- Live Aperture server coverage belongs at the final end-to-end compatibility
  stage, after the proxy/playground flow exists and can exercise the package
  through the application boundary.
