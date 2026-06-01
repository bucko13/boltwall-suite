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
- [Common Workflows](#common-workflows)
  - [Parse an L402 challenge](#parse-an-l402-challenge)
  - [Emit a payment challenge](#emit-a-payment-challenge)
  - [Build a paid retry credential](#build-a-paid-retry-credential)
  - [Decode invoice amount](#decode-invoice-amount)
  - [Mint and verify a macaroon](#mint-and-verify-a-macaroon)
- [Public API surface](#public-api-surface)
- [Protocol behavior](#protocol-behavior)
- [Runtime boundary](#runtime-boundary)
- [LSAT compatibility helpers](#lsat-compatibility-helpers)

## Installation

```sh
bun add @boltwall/l402
```

`@boltwall/l402` is ESM-only and runs in both browser and Node runtimes.

## Common Workflows

### Parse an L402 challenge

An **L402 challenge** is a `WWW-Authenticate` header the server sends when a
resource requires payment. It carries a **macaroon** (a bearer token encoding
access conditions called **caveats**) and a **BOLT 11 invoice** (the Lightning
payment request). The client pays the invoice, receives the **preimage** (proof
of payment), then retries with an `Authorization` header.

```ts
import { L402 } from "@boltwall/l402";

const header = `L402 macaroon="AGIAJEemVQUTEyNCR0exk7ek90Cg==", invoice="lnbc1500n1pw5kjhmpp5..."`;
const token = L402.fromHeader(header);

console.log(token.macaroon); // "AGIAJEemVQUTEyNCR0exk7ek90Cg=="
console.log(token.invoice); // "lnbc1500n1pw5kjhmpp5..."
```

The parser also accepts legacy `LSAT` challenges so migration clients can
handle old servers, but new servers should emit `L402` by default.

### Emit a payment challenge

```ts
import { L402 } from "@boltwall/l402";

const token = new L402({
  macaroons: "AGIAJEemVQUTEyNCR0exk7ek90Cg==",
  invoice: "lnbc1500n1pw5kjhmpp5...",
});

const responseHeaders = new Headers();

// Default server emission follows L402 protocol-specification.md §10:
// LSAT first for legacy clients, then L402 for current clients.
for (const value of token.toAuthenticateHeaders()) {
  responseHeaders.append("WWW-Authenticate", value);
}
```

Use `compatibility: "l402-only"` only when a deployment or test explicitly
does not need legacy LSAT challenge compatibility.

### Build a paid retry credential

```ts
import { L402 } from "@boltwall/l402";

const token = new L402({
  macaroons: "AGIAJEemVQUTEyNCR0exk7ek90Cg==",
  paymentPreimage: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
});
const authorization = token.toAuthorizationHeader();

const credential = L402.fromToken(authorization);

console.log(credential.macaroons.length); // 1
console.log(credential.paymentPreimage?.length); // 64
```

The preimage is bearer-sensitive proof of payment. Do not log it at info level
or expose it outside the retry request.

### Decode invoice amount

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

### Mint and verify a macaroon

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

Use cryptographically random root keys and token IDs in production, and keep root keys server-side.

## Public API surface

Use the root package export for all supported APIs:

```ts
import {
  L402,
  Identifier,
  decodeBolt11Invoice,
  mintMacaroon,
  verifyMacaroon,
  Caveat,
  servicesCaveat,
  servicesSatisfier,
} from "@boltwall/l402";
```

The current public surface groups as:

- **Object workflow:** `L402`, `Caveat`. The `L402` class is the public entry
  point for challenge and credential headers: build with `toChallenge()` /
  `toAuthenticateHeaders()`, parse with `L402.fromHeader`, `L402.fromChallenge`,
  and `L402.fromToken`. The lower-level header parse/build functions are
  package-internal and not importable.
- **Invoice and identifier helpers:** `decodeBolt11Invoice`, and the
  `Identifier` value class (`Identifier.fromMacaroon(macaroon)` decodes a
  macaroon's v0 identifier)
- **Macaroon helpers:** `mintMacaroon`, `verifyMacaroon`, `inspectMacaroon`,
  `InMemoryRootKeyStore`, `RootKeyStore` interface
- **Caveat helpers:** `parseCaveat`, `serializeCaveat`, `servicesCaveat`,
  `capabilitiesCaveat`, `constraintCaveat`, and satisfier factories for
  services, capabilities, origin, route, and `valid-until`
- **Compatibility helpers:** `expirationCaveat`, `expirationSatisfier`

There are no public `@boltwall/l402/*` subpaths. Pricing amounts
are millisatoshis as `bigint` (e.g. `DecodedInvoice.amountMsat`).

For full symbol-level detail, run `bun run docs:api` to generate the TypeDoc
API site from inline JSDoc.

## Protocol behavior

The package follows the current L402 scheme while preserving deployed LSAT
compatibility where the protocol requires it:

- `L402#toAuthenticateHeaders()` defaults to dual challenge emission:
  `LSAT` first, then `L402`. This follows L402 protocol-specification.md §10.
  `L402#toChallenge()` emits a single `L402` challenge (or `LSAT` with
  `{ legacy: true }`).
- `L402.fromHeader` / `L402.fromChallenge` accept both `LSAT` and `L402`
  challenge schemes and handle challenges from repeated or folded headers.
- `L402#toAuthorizationHeader()` emits `L402` by default and can emit `LSAT`
  with `{ legacy: true }`.
- `L402.fromToken` accepts both `LSAT` and `L402` credentials.
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

`@boltwall/l402` runs in both browser and Node. Use `mintMacaroon` and `verifyMacaroon` rather than raw codec internals.

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
