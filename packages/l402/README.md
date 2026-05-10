# @boltwall/l402

Browser-and-Node L402 protocol library for Boltwall Suite.

This package is scaffolded in Phase 0. Protocol parsing, invoice handling,
macaroon verification, and compatibility helpers land in later beads.

## Planned entrypoints

- `@boltwall/l402` — protocol API
- `@boltwall/l402/wallet` — wallet-provider interfaces and helpers
- `@boltwall/l402/legacy` — legacy LSAT compatibility surface
- `@boltwall/l402/testing` — fixture/test helpers

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

| Constraint | `light-bolt11-decoder@3.2.0` | `bolt11@1.4.1` (legacy-used by `lsat-js`) |
|---|---|---|
| Decode-only API | ✅ — `decode(invoice)` returns a `sections` array | ✅ — but ships encode/sign too (unused weight) |
| Browser-import-clean | ✅ — depends only on `@scure/base` (Uint8Array native) | ❌ — uses `Buffer` (via `safe-buffer`); transitive `bitcoinjs-lib`, `secp256k1`, `lodash` |
| ESM consumption | ✅ — `import { decode } from "light-bolt11-decoder"` works under Node 22 + Bun | ⚠️ — CJS only; usable via default-import interop but adds asymmetry |
| Maintenance | ✅ — last published 2024-09 | ⚠️ — last published 2023-03 |
| Disk footprint | ~156 KB (with `@scure/base`) | ~7.5 MB (with full `bitcoinjs-lib` + `secp256k1` + `lodash`) |
| Source size | 397 LOC | 1037 LOC |
| Public API uses Buffer | ❌ no | ✅ yes |

**Decode validation** (run against the spec example invoice in
`@boltwall/test-fixtures/challenges/spec-examples` —
`SPEC_EXAMPLE_INVOICE`):

```ts
import { decode } from "light-bolt11-decoder";

const decoded = decode(SPEC_EXAMPLE_INVOICE);
const byTag = (name: string) =>
  decoded.sections.find((s) => s.name === name)?.value;

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
