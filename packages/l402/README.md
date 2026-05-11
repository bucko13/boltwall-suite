# @boltwall/l402

Browser-and-Node L402 protocol library for Boltwall Suite.

## Entrypoints

- `@boltwall/l402` — protocol API
- `@boltwall/l402/legacy` — legacy LSAT compatibility helpers
- `@boltwall/l402/pricing` — millisatoshi conversion helpers

## Macaroon codec boundary

The raw macaroon codec lives inside `@boltwall/l402` as a private
implementation detail. It implements the L402 macaroon HMAC chain,
first-party caveat encoding, V2 binary serialization, and signature
verification required by `mintMacaroon`, `decodeIdentifier`, and
`verifyMacaroon`. It is intentionally not exported as
`@boltwall/l402/internal/*`, not moved to `@boltwall/internal`, and not a
standalone public package before v0.1.0.

Consumers should use `mintMacaroon` and `verifyMacaroon` instead of depending
on raw macaroon internals or the wrapped `macaroon@3.0.4` library shape. The
browser import test exercises those public APIs in Chromium and avoids loading
unpublished `dist/internal/*` paths. If a future release exposes a raw codec,
that surface needs its own JSDoc, fixtures, compatibility notes, and API docs.

Spec references: L402 macaroon-spec.md §HMAC Chain Construction, §Verification,
and §Serialization Formats / Macaroon V2 Binary Format.

## Legacy LSAT migration helpers

The `@boltwall/l402/legacy` subpath contains migration-only helpers for
existing LSAT-style credentials. New protocol code should use the L402-native
APIs from the root package.

```ts
import { expirationCaveat, expirationSatisfier } from "@boltwall/l402/legacy";
```

`expirationCaveat(unixMs)` and `expirationSatisfier()` preserve the deprecated
`expiration=<unix-ms>` caveat shape used by older LSAT middleware. Prefer the
standard `valid-until` caveat and `validUntilSatisfier` for new macaroons. See
[Migration from legacy boltwall](../../docs/migration-from-boltwall.md) for the
compatibility boundary.

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
into the bundle (orders-of-magnitude heavier than our 30 KB
`size-limit` budget for `dist/index.js`), (2) it uses Node `Buffer` in its
public API which is forbidden in browser code per AGENTS.md "Code Quality
Bar", and (3) it ships encode/sign capabilities we will never use. The
upgrade path is `decodeBolt11Invoice` (the wrapped public API in
`bw-b63.6`) shielding consumers from the underlying choice; if a future
maintenance event ever forces another swap, only the wrapper changes.

**Spec citation:** [BOLT 11 — Lightning Invoice
Encoding](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md)
§§3, 6 govern HRP / amount-encoding / TLV-tagged fields. The wrapped
decoder is responsible for translating these into our `bigint` msat
canonical form at the package boundary.

**Implementation bead:** `bw-b63.6` adds `light-bolt11-decoder` as a
production dep on `@boltwall/l402` and ships
`decodeBolt11Invoice(invoice: string): DecodedInvoice` from the public
API. The spike does not pre-install the dep; that is bw-b63.6's scope.
