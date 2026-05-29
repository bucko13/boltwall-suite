# @boltwall/l402

A TypeScript library for creating, parsing, validating, and inspecting L402
credentials and challenges (browser + Node).

`@boltwall/l402` owns protocol parsing, header serialization, BOLT 11 invoice
decoding, L402 macaroon minting and verification, caveat helpers, and the
LSAT compatibility facade. The package is ESM-only with one public
entrypoint (`@boltwall/l402`). Browser-facing APIs work on `string`,
`Uint8Array`, `bigint`, and Web platform types — no Node `Buffer` required.

New to L402? See the [project README](../../README.md#what-is-l402) for what
L402 is and how the packages fit together.

## Contents

- [Installation](#installation)
- [Quick start: parse an L402 challenge](#quick-start-parse-an-l402-challenge)
- [Quick start: emit a payment challenge](#quick-start-emit-a-payment-challenge)
- [Quick start: build a paid retry credential](#quick-start-build-a-paid-retry-credential)
- [Quick start: decode invoice amount](#quick-start-decode-invoice-amount)
- [Quick start: mint and verify a macaroon](#quick-start-mint-and-verify-a-macaroon)
- [Public API surface](#public-api-surface)
- [Protocol behavior](#protocol-behavior)
- [Runtime boundary](#runtime-boundary)
- [Pending facade tokens](#pending-facade-tokens)
- [LSAT compatibility helpers](#lsat-compatibility-helpers)
- [BOLT 11 decoder rationale](#bolt-11-decoder-rationale)

## Installation

The package is not yet published to npm. To use it today, clone the monorepo
and follow the [root README quickstart](../../README.md#quickstart). The
package will be published to npm as `@boltwall/l402` at the v0.1.0 release.

## Quick start: parse an L402 challenge

An **L402 challenge** is a `WWW-Authenticate` header the server sends when a
resource requires payment. It carries a **macaroon** (a bearer token encoding
access conditions called **caveats**) and a **BOLT 11 invoice** (the Lightning
payment request). The client pays the invoice, receives the **preimage** (proof
of payment), then retries with an `Authorization` header.

```ts
import { parseAuthenticateHeader } from "@boltwall/l402";

const header = `L402 macaroon="AGIAJEemVQUTEyNCR0exk7ek90Cg==", invoice="lnbc1500n1pw5kjhmpp5..."`;
const challenges = parseAuthenticateHeader(header);

console.log(challenges[0]?.scheme);   // "L402"
console.log(challenges[0]?.macaroon); // "AGIAJEemVQUTEyNCR0exk7ek90Cg=="
console.log(challenges[0]?.invoice);  // "lnbc1500n1pw5kjhmpp5..."
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

console.log(credential.scheme);           // "L402"
console.log(credential.macaroons.length); // 1
console.log(credential.preimage.length);  // 64
```

The preimage is bearer-sensitive proof of payment. Do not log it at info level
or expose it outside the retry request.

## Quick start: decode invoice amount

```ts
import { decodeBolt11Invoice } from "@boltwall/l402";

// Truncated for readability; real invoices are much longer.
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
`sha256` of the all-zero preimage used above. Production code must use
cryptographically random root keys and token ids, use the real invoice payment
hash, and store root keys server-side only.

## Public API surface

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

The current public surface groups as:

- **Header helpers:** `parseAuthenticateHeader`, `buildAuthenticateHeaders`,
  `parseAuthorizationHeader`, `buildAuthorizationHeader`
- **Invoice and identifier helpers:** `decodeBolt11Invoice`, `decodeIdentifier`
- **Macaroon helpers:** `mintMacaroon`, `verifyMacaroon`,
  `InMemoryRootKeyStore`, `RootKeyStore` interface
- **Caveat helpers:** `parseCaveat`, `serializeCaveat`, `servicesCaveat`,
  `capabilitiesCaveat`, `constraintCaveat`, and satisfier factories for
  services, capabilities, origin, route, and `valid-until`
- **Compatibility helpers:** `L402`, `expirationCaveat`, `expirationSatisfier`

There are no public `@boltwall/l402/*` subpaths in v0.1.0. Pricing amounts
are millisatoshis as `bigint` (e.g. `DecodedInvoice.amountMsat`).

For full symbol-level detail, run `bun run docs:api` to generate the TypeDoc
API site from inline JSDoc.

## Protocol behavior

The package follows the current L402 scheme while preserving deployed LSAT
compatibility where the protocol requires it:

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
  macaroon-spec.md §Verification. Pass `strictUnknownCaveats: true` for a
  fail-closed policy, but middleware must still register satisfiers for every
  caveat it relies on.
- L402 credentials are bearer credentials. Production deployments must protect
  `WWW-Authenticate` and `Authorization` headers with TLS; see L402
  protocol-specification.md §9.1.

Protocol compliance: see [docs/protocol-compatibility.md](../../docs/protocol-compatibility.md).

## Runtime boundary

`@boltwall/l402` targets browser and Node runtimes. The raw macaroon codec is
a private implementation detail implementing the L402 macaroon HMAC chain,
first-party caveat encoding, V2 binary serialization, and signature
verification for `mintMacaroon`, `decodeIdentifier`, and `verifyMacaroon`. It
is intentionally not exported before v0.1.0.

The private V2 codec targets the byte layout emitted and parsed by Aperture's
`gopkg.in/macaroon.v2` dependency. The current L402 macaroon-spec.md
§Serialization Formats / Macaroon V2 Binary Format table describes caveat
identifier and verification-id tags differently from the Go reference codec.
See [docs/protocol-compatibility.md](../../docs/protocol-compatibility.md) for
the compatibility note and fixture impact.

Use `mintMacaroon` and `verifyMacaroon` rather than depending on raw macaroon
internals or the wrapped `macaroon@3.0.4` library shape. If a future release
exposes a raw codec, that surface will need its own JSDoc, fixtures,
compatibility notes, and API docs.

## Pending facade tokens

`L402.fromToken()` accepts a trailing-colon token such as `LSAT <macaroon>:`
so legacy `lsat-js` migration code can model a macaroon whose invoice has not
been paid yet. That object state is intentionally separate from a paid HTTP
Authorization credential: L402 protocol-specification.md §5 defines the retry
credential as `<macaroons>:<preimage-hex>`, and the preimage is the proof of
payment.

`L402#toToken()` throws `missing-preimage` while the object is pending. Call
`setPreimage(preimage)` first, or use `toPendingToken()` only for explicit
migration persistence where the value will not be sent as an Authorization
header. `parseAuthorizationHeader()` remains strict and rejects missing or
malformed preimages.

## LSAT compatibility helpers

The root `@boltwall/l402` package includes compatibility helpers for existing
LSAT-style credentials. New protocol code should prefer L402-native caveats,
but imported LSAT macaroons may still carry the older `expiration=<unix-ms>`
caveat shape.

```ts
import { expirationCaveat, expirationSatisfier } from "@boltwall/l402";
```

`expirationCaveat(unixMs)` and `expirationSatisfier()` preserve that LSAT
caveat shape. Prefer the standard `valid-until` caveat and
`validUntilSatisfier` for new macaroons. L402 protocol-specification.md §10
requires accepting legacy `LSAT` credentials, but the package does not expose
a broad `@boltwall/l402/legacy` public subpath.

## BOLT 11 decoder rationale

The package uses [`light-bolt11-decoder`](https://github.com/fiatjaf/light-bolt11-decoder)
(MIT, v3.2.0+) to extract amount, payment-hash, expiry, and description from
BOLT 11 invoices embedded in L402 challenges. Decode-only is sufficient because
servers mint invoices through their Lightning backend (`@boltwall/adapters`),
not through a local encoder.

`light-bolt11-decoder` was chosen over the library the earlier `lsat-js`
project used (`bolt11@1.4.1`) because the older library pulls `bitcoinjs-lib`,
`secp256k1`, and `lodash` into the bundle (~7.5 MB vs ~156 KB), uses Node
`Buffer` in its public API, and ships encode/sign code the package never needs.
`decodeBolt11Invoice` wraps the underlying decoder so consumers stay insulated
from any future swap.

Spec reference: [BOLT 11 — Lightning Invoice
Encoding](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
§§3, 6 govern HRP / amount-encoding / TLV-tagged fields.
