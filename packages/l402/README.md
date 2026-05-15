# @boltwall/l402

Browser-and-Node TypeScript implementation of the L402 HTTP authentication
surface for Boltwall Suite.

`@boltwall/l402` owns protocol parsing, header serialization, BOLT 11 invoice
decoding, L402 macaroon minting and verification, caveat helpers, and the
small legacy LSAT compatibility facade. The package is ESM-only, has one public
entrypoint (`@boltwall/l402`), and keeps browser-facing APIs on `string`,
`Uint8Array`, `bigint`, and Web platform types. Public APIs do not require
Node `Buffer`.

## Public API

Use the root package export for all supported APIs:

```ts
import {
  L402,
  buildAuthenticateHeaders,
  buildAuthorizationHeader,
  decodeBolt11Invoice,
  decodeIdentifier,
  mintMacaroon,
  parseAuthenticateHeader,
  parseAuthorizationHeader,
  verifyMacaroon,
} from "@boltwall/l402";
```

The current public surface includes:

- Header helpers: `parseAuthenticateHeader`, `buildAuthenticateHeaders`,
  `parseAuthorizationHeader`, and `buildAuthorizationHeader`.
- Invoice and identifier helpers: `decodeBolt11Invoice` and
  `decodeIdentifier`.
- Macaroon helpers: `mintMacaroon`, `verifyMacaroon`,
  `InMemoryRootKeyStore`, and the `RootKeyStore` interface.
- Caveat helpers: `parseCaveat`, `serializeCaveat`, `servicesCaveat`,
  `capabilitiesCaveat`, `constraintCaveat`, and satisfier factories for
  services, capabilities, origin, route, and `valid-until`.
- Compatibility helpers: `L402`, `expirationCaveat`, and
  `expirationSatisfier`.

There are no public `@boltwall/l402/*` subpaths in v0.1.0. The earlier empty
`wallet`, `testing`, `pricing`, `legacy`, and `internal` subpaths are not part
of the stable package API. Pricing amounts exposed by this package are
millisatoshis represented as `bigint`, such as `DecodedInvoice.amountMsat`.

## Protocol behavior

The package follows the current L402 scheme while preserving the deployed LSAT
scheme where the protocol requires compatibility:

- `buildAuthenticateHeaders()` defaults to dual challenge emission:
  `LSAT` first, then `L402`. This follows L402 protocol-specification.md §10.
- `parseAuthenticateHeader()` accepts both `LSAT` and `L402` challenge
  schemes and returns all challenges from repeated or folded headers.
- `buildAuthorizationHeader()` emits `L402` by default and can emit `LSAT`
  with `{ legacy: true }`.
- `parseAuthorizationHeader()` accepts both `LSAT` and `L402` credentials.
- Multi-macaroon credentials are first-class:
  `L402 M1,M2:<preimage-hex>` parses to `macaroons: ["M1", "M2"]`.
- `verifyMacaroon()` verifies every macaroon in the credential, requires all
  macaroons to bind to the same payment hash, and verifies the supplied
  preimage against that hash.
- Unknown caveats are skipped by default, as required by L402
  macaroon-spec.md §Verification. Callers that need a policy fail-closed mode
  can pass `strictUnknownCaveats: true`, but middleware must still register
  satisfiers for every caveat it relies on.
- L402 credentials are bearer credentials. Production deployments must protect
  `WWW-Authenticate` and `Authorization` headers with TLS; see L402
  protocol-specification.md §9.1.

## Runtime boundary

`@boltwall/l402` is designed for browser and Node runtimes. The raw macaroon
codec lives inside the package as a private implementation detail. It
implements the L402 macaroon HMAC chain, first-party caveat encoding, V2 binary
serialization, and signature verification required by `mintMacaroon`,
`decodeIdentifier`, and `verifyMacaroon`. It is intentionally not exported as
`@boltwall/l402/internal/*`, not moved to `@boltwall/internal`, and not a
standalone public package before v0.1.0.

Consumers should use `mintMacaroon` and `verifyMacaroon` instead of depending
on raw macaroon internals or the wrapped `macaroon@3.0.4` library shape. If a
future release exposes a raw codec, that surface needs its own JSDoc, fixtures,
compatibility notes, and API docs.

Spec references: L402 macaroon-spec.md §HMAC Chain Construction, §Verification,
and §Serialization Formats / Macaroon V2 Binary Format.

## Quick start: parse an L402 challenge

```ts
import { parseAuthenticateHeader } from "@boltwall/l402";

const header = `L402 macaroon="AGIAJEemVQUTEyNCR0exk7ek90Cg==", invoice="lnbc1500n1pw5kjhmpp5..."`;
const challenges = parseAuthenticateHeader(header);

console.log(challenges[0]?.scheme); // "L402"
console.log(challenges[0]?.macaroon); // "AGIAJEemVQUTEyNCR0exk7ek90Cg=="
console.log(challenges[0]?.invoice); // "lnbc1500n1pw5kjhmpp5..."
```

The parser also accepts legacy `LSAT` challenges so migration clients can
handle old servers, but new servers should emit `L402` by default.

## Quick start: emit a payment challenge

```ts
import { buildAuthenticateHeaders } from "@boltwall/l402";

const headers = buildAuthenticateHeaders({
  macaroon: "AGIAJEemVQUTEyNCR0exk7ek90Cg==",
  invoice: "lnbc1500n1pw5kjhmpp5...",
});

const responseHeaders = new Headers();

// Default server emission follows L402 protocol-specification.md §10:
// LSAT first for legacy clients, then L402 for current clients.
for (const value of headers) {
  responseHeaders.append("WWW-Authenticate", value);
}
```

Use `compatibility: "l402-only"` only when a deployment or test explicitly
does not need legacy LSAT challenge compatibility.

## Quick start: build a paid retry credential

```ts
import { buildAuthorizationHeader, parseAuthorizationHeader } from "@boltwall/l402";

const authorization = buildAuthorizationHeader({
  macaroons: ["AGIAJEemVQUTEyNCR0exk7ek90Cg=="],
  preimage: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
});

const credential = parseAuthorizationHeader(authorization);

console.log(credential.scheme); // "L402"
console.log(credential.macaroons.length); // 1
console.log(credential.preimage.length); // 64
```

The preimage is bearer-sensitive proof of payment. Do not log it at info level
or expose it outside the retry request.

## Quick start: decode invoice amount

```ts
import { decodeBolt11Invoice } from "@boltwall/l402";

const invoice = "lnbc1500n1pw5kjhmpp5...";
const decoded = decodeBolt11Invoice(invoice);

console.log(decoded.paymentHashHex);
console.log(decoded.amountMsat); // bigint, in millisatoshis
console.log(decoded.expiresAt);
```

The decoded amount is always `bigint` millisatoshis. Downstream pricing policy
must compare against that unit directly; avoid `number` satoshi conversions in
verification paths.

## Quick start: mint and verify a macaroon

```ts
import {
  InMemoryRootKeyStore,
  mintMacaroon,
  servicesCaveat,
  servicesSatisfier,
  verifyMacaroon,
} from "@boltwall/l402";

const rootKey = new Uint8Array(32);
const tokenId = new Uint8Array(32);
const paymentHash = Uint8Array.from([
  0x66, 0x68, 0x7a, 0xad, 0xf8, 0x62, 0xbd, 0x77, 0x6c, 0x8f, 0xc1, 0x8b, 0x8e, 0x9f, 0x8e, 0x20,
  0x08, 0x97, 0x14, 0x85, 0x6e, 0xe2, 0x33, 0xb3, 0x90, 0x2a, 0x59, 0x1d, 0x0d, 0x5f, 0x29, 0x25,
]);

const macaroon = mintMacaroon({
  rootKey,
  identifier: { version: 0, paymentHash, tokenId },
  caveats: [servicesCaveat([{ name: "pokedex", tier: 0 }])],
});

const rootKeyStore = new InMemoryRootKeyStore();
await rootKeyStore.put(tokenId, rootKey);

const result = await verifyMacaroon({
  macaroons: [macaroon],
  preimage: "0000000000000000000000000000000000000000000000000000000000000000",
  rootKeyStore,
  satisfiers: [servicesSatisfier("pokedex")],
  context: {},
});

console.log(result.ok);
```

The example uses deterministic test bytes for readability; the payment hash is
`sha256` of the all-zero preimage used below. Production code must use
cryptographically random root keys and token ids, use the real invoice payment
hash, and store root keys server-side only.

## Pending facade tokens

`L402.fromToken()` accepts a trailing-colon token such as `LSAT <macaroon>:` so
legacy `lsat-js` migration code can model a macaroon whose invoice has not been
paid yet. That object state is intentionally separate from a paid HTTP
Authorization credential: L402 protocol-specification.md §5 defines the retry
credential as `<macaroons>:<preimage-hex>`, and the preimage is the proof of
payment.

For that reason, `L402#toToken()` throws `missing-preimage` while the object is
pending. Call `setPreimage(preimage)` first, or use `toPendingToken()` only for
explicit migration persistence where the value will not be sent as an
Authorization header. `parseAuthorizationHeader()` remains strict and rejects
missing or malformed preimages. Both `L402` and `LSAT` schemes are accepted for
incoming credentials per L402 protocol-specification.md §10.

## LSAT compatibility helpers

The root `@boltwall/l402` package includes compatibility helpers for existing
LSAT-style credentials. New protocol code should prefer L402-native caveats,
but imported LSAT macaroons may still carry the older `expiration=<unix-ms>`
caveat shape.

```ts
import { expirationCaveat, expirationSatisfier } from "@boltwall/l402";
```

`expirationCaveat(unixMs)` and `expirationSatisfier()` preserve that imported
LSAT caveat shape. Prefer the standard `valid-until` caveat and
`validUntilSatisfier` for new macaroons. L402 protocol-specification.md §10
requires accepting legacy `LSAT` credentials, but the package does not expose a
broad `@boltwall/l402/legacy` public subpath.

## Tech stack decisions

### BOLT 11 invoice decoder: `light-bolt11-decoder`

**Decision (bw-f4p.17):** the L402 macaroon's identifier embeds the Lightning
`payment_hash`; the credential carries the matching `preimage`. The
challenge header carries the BOLT 11 `invoice` itself. We therefore need a
BOLT 11 decoder for amount, payment-hash, expiry, description, and (later)
description-hash extraction. We do **not** need encode capability —
servers mint invoices through their Lightning backend (`@boltwall/adapters`),
not through a local encoder.

**Chosen:** [`light-bolt11-decoder`](https://github.com/fiatjaf/light-bolt11-decoder)
(MIT, v3.2.0+).

| Constraint             | `light-bolt11-decoder@3.2.0`                                                   | `bolt11@1.4.1` (legacy-used by `lsat-js`)                                                 |
| ---------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Decode-only API        | ✅ — `decode(invoice)` returns a `sections` array                              | ✅ — but ships encode/sign too (unused weight)                                            |
| Browser-import-clean   | ✅ — depends only on `@scure/base` (Uint8Array native)                         | ❌ — uses `Buffer` (via `safe-buffer`); transitive `bitcoinjs-lib`, `secp256k1`, `lodash` |
| ESM consumption        | ✅ — `import { decode } from "light-bolt11-decoder"` works under Node 22 + Bun | ⚠️ — CJS only; usable via default-import interop but adds asymmetry                       |
| Maintenance            | ✅ — last published 2024-09                                                    | ⚠️ — last published 2023-03                                                               |
| Disk footprint         | ~156 KB (with `@scure/base`)                                                   | ~7.5 MB (with full `bitcoinjs-lib` + `secp256k1` + `lodash`)                              |
| Source size            | 397 LOC                                                                        | 1037 LOC                                                                                  |
| Public API uses Buffer | ❌ no                                                                          | ✅ yes                                                                                    |

**Decode validation** (run against the spec example invoice in
`@boltwall/test-fixtures/challenges/spec-examples` —
`SPEC_EXAMPLE_INVOICE`):

```ts
import { decode } from "light-bolt11-decoder";

const decoded = decode(SPEC_EXAMPLE_INVOICE);
const byTag = (name: string) => decoded.sections.find((s) => s.name === name)?.value;

byTag("payment_hash"); // "4f346baeff5a99cc6c5636b1e72ff750f4aa0e2fc1250482fc38e06a9822a7dc"
BigInt(byTag("amount") ?? "0"); // 150000n  (msat)
byTag("expiry"); // 10800
byTag("description"); // "Read: What is causing LN adoption to m..."
```

`amount` is returned as a decimal string (msat); convert to `bigint` at the
boundary per the [numeric strategy](../../docs/numeric-strategy.md).

**Why not the legacy choice?** `bolt11@1.4.1` was the legacy-used dep
(`Tierion/lsat-js@^1.3.2`), but it fails the modern constraints in three
load-bearing ways: (1) it pulls `bitcoinjs-lib` + `secp256k1` + `lodash`
into the bundle (orders-of-magnitude heavier than our `size-limit`
budget for `dist/index.js`), (2) it uses Node `Buffer` in its public API, which
is forbidden in browser-facing package code, and (3) it ships encode/sign
capabilities we will never use. The
upgrade path is `decodeBolt11Invoice` (the wrapped public API in
`bw-b63.6`) shielding consumers from the underlying choice; if a future
maintenance event ever forces another swap, only the wrapper changes.

**Spec citation:** [BOLT 11 — Lightning Invoice
Encoding](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
§§3, 6 govern HRP / amount-encoding / TLV-tagged fields. The wrapped
decoder is responsible for translating these into our `bigint` msat
canonical form at the package boundary.

**Implementation:** `@boltwall/l402` ships
`decodeBolt11Invoice(invoice: string): DecodedInvoice` from the root public API.
The wrapper keeps consumers insulated from the underlying decoder package.
