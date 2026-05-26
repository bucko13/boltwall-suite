# Protocol Compatibility

This document records how `@boltwall/l402` behaves relative to the L402
protocol specification, the Lightning Labs Aperture reference implementation,
the MIT `Tierion/lsat-js` client library, and the legacy AGPL `bucko13/boltwall`
middleware. The live L402 specifications remain authoritative for protocol
behavior; where this document and the spec disagree, the spec wins and the code
is the bug.

Authoritative sources:

- L402 protocol-specification.md — <https://github.com/lightninglabs/L402/blob/master/protocol-specification.md>
- L402 macaroon-spec.md — <https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md>
- Aperture (Go reference) — <https://github.com/lightninglabs/aperture>
- `Tierion/lsat-js` (MIT) — <https://github.com/Tierion/lsat-js>
- `bucko13/boltwall` (AGPL — reference only) — <https://github.com/bucko13/boltwall>

> **AGPL isolation.** The legacy-boltwall column describes externally observable
> behavior derived from the L402 specs, the MIT `lsat-js` audit, and the public
> `boltwall` README — not from reading or copying AGPL source. See
> `AGENTS.md` → AGPL Isolation.

---

## Wire format

### Challenge header (`WWW-Authenticate`)

Per L402 protocol-specification.md §5, the challenge grammar is:

```
l402-challenge = "L402" 1*SP macaroon-param "," SP invoice-param
macaroon-param = "macaroon" "=" quoted-string
invoice-param  = "invoice"  "=" quoted-string
```

Per §10, "Servers SHOULD send both `LSAT` and `L402` scheme names in
`WWW-Authenticate` challenge headers. The `LSAT` header SHOULD appear first for
compatibility with older client implementations."

`@boltwall/l402` emits dual challenges with **LSAT first, L402 second** by
default. `buildAuthenticateHeaders({ macaroon, invoice })` returns two header
values in that order (`compatibility` defaults to `"dual"`); `"l402-only"` and
`"lsat-only"` are explicit overrides for greenfield deployments, tests, and
migrations (`packages/l402/src/build-authenticate-headers.ts`). The `L402` class
convenience method `toChallenge()` defaults to `"l402-only"` for a single header
and emits `"lsat-only"` under `{ legacy: true }`; servers that want the
recommended dual challenge use the `buildAuthenticateHeaders` helper.

### Authorization header

Per §5, the credential grammar is:

```
l402-credential = "L402" 1*SP macaroons ":" preimage
macaroons       = base64 *("," base64)
preimage        = 1*HEXDIG
```

"Multiple macaroons are base64-encoded individually and comma-separated before
the colon." "The macaroon is base64-encoded per RFC 4648. The preimage is
hex-encoded." Per §10, "Clients and servers MUST accept both `LSAT` and `L402`
in `Authorization` headers."

`parseAuthorizationHeader` accepts both scheme names case-insensitively, always
normalizes to a macaroon array (length ≥ 1, so single- and multi-macaroon
credentials are handled uniformly), and splits on the **last** `:` so a base64
macaroon's internal bytes never confuse preimage extraction. An empty preimage
is accepted only with the explicit `allowEmptyPreimage` option, used for the
HODL pending-settlement flow (`packages/l402/src/parse-authorization-header.ts`).

### Identifier layout (66-byte v0)

Per L402 macaroon-spec.md §Identifier Structure, the version-0 identifier is
`version_bytes || payment_hash || token_id`: 2-byte big-endian `uint16` version
`0`, 32-byte payment hash, 32-byte token id, 66 bytes total.

`@boltwall/l402` encodes and decodes exactly this layout. `decodeIdentifier`
rejects any length other than 66 bytes (`invalid-identifier-length`) and any
version other than 0 (`unsupported-identifier-version`); see
`packages/l402/src/decode-identifier.ts` and the encoder in
`packages/l402/src/mint-macaroon.ts`.

### Status code mapping (402 vs 401)

Per L402 protocol-specification.md §6, the server "MUST reply with HTTP 402
(Payment Required)" for the initial missing-credential challenge, and "If
verification fails, the server MUST return 401 Unauthorized" — including a
credential that is present but tampered, or whose preimage does not match the
payment hash.

`@boltwall/middleware` maps failure reasons to status codes accordingly
(`packages/middleware/src/core/error.ts`):

| Reason                     | Status | Meaning                                       |
| -------------------------- | ------ | --------------------------------------------- |
| `payment-required`         | 402    | No credential present → emit challenge        |
| `invalid-credential`       | 401    | Credential present but unparseable / tampered |
| `invalid-preimage`         | 401    | `sha256(preimage) != payment_hash`            |
| `caveat-rejected`          | 401    | A satisfier rejected a caveat                 |
| `invoice-provider-failure` | 502    | Backend (Lightning node) error                |
| `bad-request`              | 400    | Challenge could not be constructed            |

402 is reserved for the initial challenge only; every present-but-invalid
credential is 401, per spec.

---

## Macaroon binary format

### V2 binary serialization

Per L402 macaroon-spec.md §Serialization, macaroons use the libmacaroon V2
binary TLV format (`tag || varint(length) || data`), and are base64-encoded
(standard, with padding) in the `WWW-Authenticate` `macaroon` parameter and in
`Authorization` credentials. (gRPC metadata uses hex; that transport is out of
scope for the HTTP middleware.)

`@boltwall/l402` mints, serializes, decodes, and verifies base64 V2 binary
macaroons through its private codec (`packages/l402/src/internal/macaroon.ts`),
keeping `Uint8Array` end-to-end with no `Buffer` on any public surface.

### V2 tag table compatibility note

The live L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary
Format currently mixes V2 field tags and first-party caveat shape in a way that
does not match the Go macaroon implementation used by Aperture. The spec table
says header location is tag `0x06`, caveat location is tag `0x05`, caveat
identifier is tag `0x01`, and first-party caveats carry an empty verification-id
field tagged `0x02`.

Aperture's `go.mod` depends on `gopkg.in/macaroon.v2`. That implementation's
V2 codec defines EOS `0`, location `1`, identifier `2`, verification id `4`,
and signature `6` (`github.com/go-macaroon/macaroon/packet-v2.go`). Its binary
marshaller treats the first byte as the V2 version, uses field tag `2` for both
the header identifier and caveat identifier, and omits the verification-id field
entirely for first-party caveats whose verification id is empty
(`github.com/go-macaroon/macaroon/marshal-v2.go`).

Boltwall therefore targets the Aperture/go-macaroon V2 byte layout for
interoperability while documenting this as a spec-table inconsistency, not a
new local format:

| Segment                   | Boltwall / go-macaroon bytes | Current spec table/example conflict |
| ------------------------- | ---------------------------- | ----------------------------------- |
| Version                   | version byte `0x02`          | no compatibility conflict           |
| Header identifier         | tag `0x02`                   | matches spec table                  |
| First-party caveat id     | tag `0x02`                   | spec table/example say tag `0x01`   |
| Empty first-party VID     | omitted                      | spec example emits `0x02 0x00`      |
| Non-empty third-party VID | tag `0x04`                   | spec table says tag `0x02`          |
| Signature                 | tag `0x06`                   | matches spec table                  |

No fixture change is required for this note because existing V2 fixtures already
encode the Aperture/go-macaroon layout. `packages/l402/test/macaroon-codec.test.ts`
locks that byte layout explicitly so a future cleanup does not accidentally
switch the private codec to the inconsistent table.

### Identifier version dispatch

We decode version 0 only. A non-zero version throws
`unsupported-identifier-version` rather than guessing a layout. Future identifier
versions, if the spec defines them, are an explicit additive change to
`decodeIdentifier`, not a silent reinterpretation of the existing bytes.

---

## Caveat semantics

### Encoding

Per L402 macaroon-spec.md §Caveat Format, "Caveats are UTF-8 string-encoded
key-value pairs separated by a single `=` character" (`condition=value`). The raw
UTF-8 bytes enter the HMAC chain.

`parseCaveat` splits on the **first** `=`; later `=` bytes are preserved in the
value (`packages/l402/src/caveats.ts`). `serializeCaveat` produces exactly
`condition=value`.

### Standard caveats

The spec defines a service/capability/constraint hierarchy. `@boltwall/l402`
provides spec-compliant constructors:

| Spec caveat                                   | Example                                 | Helper                                            |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------- |
| `services` (`name:tier`, comma-separated)     | `services=lightning_loop:0,pool:0`      | `servicesCaveat([{ name, tier }])`                |
| `<service>_capabilities` (comma-separated)    | `lightning_loop_capabilities=loop_out`  | `capabilitiesCaveat(service, [capabilities])`     |
| `<capability>_<constraint>=value` constraints | `loop_out_valid_until=<unix-timestamp>` | `constraintCaveat(capability, constraint, value)` |

Built-in satisfiers (`servicesSatisfier`, `capabilitiesSatisfier`,
`validUntilSatisfier`) enforce subset attenuation across an attenuation chain
(`packages/l402/src/satisfiers.ts`).

### Expiration: `valid-until` vs legacy `expiration`

This is the most visible naming divergence between implementations.

| Form                        | Condition           | Value                          | Where                                                              |
| --------------------------- | ------------------- | ------------------------------ | ------------------------------------------------------------------ |
| Aperture per-capability     | `<cap>_valid_until` | Unix timestamp (string)        | spec/Aperture constraint caveat                                    |
| `@boltwall/l402` (native)   | `valid-until`       | ISO-8601 string                | `validUntil({ seconds \| iso \| date })` + `validUntilSatisfier()` |
| Legacy `boltwall`/`lsat-js` | `expiration`        | Unix **milliseconds** (string) | `expirationCaveat` / `expirationSatisfier`                         |

`@boltwall/l402` ships a first-class, standalone `valid-until=<ISO-8601>` caveat
as its native expiration mechanism. It can also produce Aperture-style
per-capability `<capability>_valid_until=<unix-ts>` constraints via
`constraintCaveat` when interoperating with the services/capabilities model.

The legacy `expiration=<unix-ms>` caveat helpers (`expirationCaveat`,
`expirationSatisfier`) are re-exported from the main `@boltwall/l402` entry
(implemented under `packages/l402/src/legacy/`) for verifying existing
LSAT-style macaroons during migration. New code should use `valid-until`. See
`docs/migration-from-boltwall.md` → Expiration caveat.

### Unknown-caveat behavior

Per L402 macaroon-spec.md §Verification: "If no satisfier is registered for a
caveat's condition, the caveat MUST be skipped (not rejected)." This lets a
holder append caveats for other services without breaking verification by
unrelated services.

`@boltwall/l402` honors this: `verifyMacaroon` skips a caveat when no satisfier
matches its condition. An opt-in `strictUnknownCaveats` flag rejects unknown
caveats instead — for audit/diagnostic use only. **Never rely on unknown caveats
failing closed** (`packages/l402/src/verify-macaroon.ts`; see also
`docs/security-boundaries.md`). Legacy `boltwall` did not consistently skip
unknown caveats, which is a behavioral divergence callers migrating old
macaroons should be aware of.

---

## Compatibility matrix

`✓` supported · `✗` not supported · `partial` partially / differently supported ·
`n/a` not applicable to that implementation's role.

| Feature                                        | @boltwall/l402           | Aperture                   | lsat-js (client)  | legacy boltwall       |
| ---------------------------------------------- | ------------------------ | -------------------------- | ----------------- | --------------------- |
| Dual-scheme challenge emission (LSAT first)    | ✓ default                | ✓ (LSAT then L402)         | n/a (no server)   | partial (LSAT-only)   |
| L402-only challenge override                   | ✓ explicit               | accepts both               | n/a               | ✗                     |
| Accepts `LSAT` + `L402` `Authorization`        | ✓                        | ✓                          | ✓ (LSAT)          | ✓                     |
| Multi-macaroon credential parse                | ✓                        | ✓                          | partial           | partial               |
| Identifier v0 (66-byte, BE version)            | ✓                        | ✓                          | ✓                 | ✓                     |
| Macaroon V2 binary, base64 in HTTP             | ✓                        | ✓                          | ✓                 | ✓                     |
| 402 challenge / 401 invalid status mapping     | ✓                        | ✓                          | n/a (client)      | partial               |
| Spec-compliant `services=name:tier`            | ✓                        | ✓                          | partial           | ✗ (free-form)         |
| `<service>_capabilities`                       | ✓                        | ✓                          | partial           | ✗                     |
| `<capability>_<constraint>=value` constraints  | ✓ (`constraintCaveat`)   | ✓                          | partial           | ✗                     |
| Native `valid-until=<ISO-8601>` expiration     | ✓                        | ✗ (uses `_valid_until` ts) | ✗                 | ✗ (`expiration=<ms>`) |
| Verify legacy `expiration=<unix-ms>`           | ✓ (legacy helpers)       | ✗                          | ✓                 | ✓                     |
| Unknown caveats skipped (not fail-closed)      | ✓ (strict mode optional) | ✓                          | ✓                 | partial               |
| Constant-time signature + payment-hash compare | ✓                        | ✓                          | ✗                 | ✗                     |
| Browser-safe public API (no `Buffer`)          | ✓                        | n/a (Go)                   | ✗ (`Buffer`)      | ✗                     |
| `bigint` millisatoshi amounts                  | ✓                        | n/a                        | ✗ (`number` sats) | ✗ (`number` sats)     |

---

## Aperture interop test results

Two interop surfaces guard the protocol boundary against the Aperture reference
implementation. See `docs/testing.md` for the full test-surface table.

### Vector smoke (runs on every `bun test`)

`packages/l402/test/interop/aperture-smoke.test.ts` is included in the default
test glob and requires no infrastructure. It mints, serializes, decodes, and
verifies deterministic macaroons against Aperture's documented byte layout and
behavior, using the same `payment_hash = [1..32]` / `token_id = [32..1]` vectors
as Aperture's `l402/identifier_test.go`.

| Surface                | Boltwall behavior                                                                           | Vector smoke status                                                |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Authorization scheme   | Accepts both schemes; emits L402 (single) / dual LSAT-first via `buildAuthenticateHeaders`. | Parses both header shapes.                                         |
| Macaroon serialization | Mints/verifies base64 V2 binary macaroons via the private codec.                            | Mints, serializes, decodes, verifies deterministic macaroons.      |
| Identifier shape       | 2-byte BE version 0 + 32-byte payment hash + 32-byte token id.                              | Matches Aperture's `[1..32]` / `[32..1]` byte layout exactly.      |
| Payment proof          | `verifyMacaroon` checks the `sha256(preimage) == payment_hash` relation after signature.    | Verifies a deterministic preimage-bound macaroon.                  |
| Caveat parsing         | `parseCaveat` splits at the first `=`, preserving later `=` bytes.                          | Covers `expiration=1337`, `expiration=1337=`, and malformed input. |
| Unknown caveats        | Skipped by default; explicit strict mode for audits.                                        | Includes an unknown caveat alongside known satisfiers.             |

### Live Aperture interop (PR / nightly only)

`packages/l402/test/interop/aperture-pr.test.ts` runs only under
`bun run test:interop` (from `packages/l402`, with `APERTURE_INTEROP=1`) and
requires Docker + an LND regtest stack. The `.github/workflows/compat-aperture.yml`
workflow runs it on `packages/l402` / `packages/test-fixtures` pull requests and
via `workflow_dispatch`, using the repository's LND regtest secrets. Scenarios:

1. `GET` protected endpoint → 402 with a parseable L402 challenge.
2. Challenge macaroon → `decodeIdentifier` extracts a valid v0 identifier.
3. `Authorization` header built from the challenge macaroon → Aperture accepts it.
4. Tampered macaroon → Aperture returns 401, not 200.
5. Dual-scheme challenge → both `L402` and `LSAT` parse correctly.
6. Multi-macaroon credential → `parseAuthorizationHeader` accepts it.

Because the live suite depends on regtest secrets that do not run on every push,
its pass/fail status is reported by the nightly/PR workflow run rather than
recorded statically here; consult the latest `Aperture Interop` workflow run for
current results. Live-server TLS behavior is exercised by end-to-end
deployment testing, not by these protocol-boundary tests.

---

## Migration guidance

- Migrating client/library code from MIT `lsat-js` — `docs/migration-from-lsat-js.md`
  (full public-API decision table; the `L402` class facade preserves the
  `fromToken` / `toToken` / `fromChallenge` workflow with `Uint8Array` / `bigint`
  types and default L402 scheme emission).
- Migrating server middleware from AGPL `boltwall` — `docs/migration-from-boltwall.md`
  (config rename map, capability-flag behavior, HODL flow, and the
  `expiration` → `valid-until` caveat change).
  </content>
