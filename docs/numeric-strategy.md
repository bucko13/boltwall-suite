# Numeric Strategy

Maintainer reference for representing money amounts, payment-hash counters,
expiry timestamps, and any other numeric values that cross package boundaries
in Boltwall Suite. Treat these conventions as part of the public API contract.

## TL;DR

- **Internal canonical money type: native `bigint` millisatoshis (`msat`).**
- **No external BigNum or decimal library.** Native `bigint` covers every
  amount Lightning can express, and string-input parsing is a small enough
  problem to live as a helper in `@boltwall/internal` under the dependency
  policy.
- **Ergonomic workspace helpers:** `sats(n)`, `msats(n)`, `btc(n)` returning
  `bigint` msat, kept in `@boltwall/internal/numeric` for package
  implementation code. Public package configuration exposes typed `bigint`
  fields rather than requiring consumers to import conversion helpers.
- **`number` is forbidden for any money amount that crosses a public package
  boundary.** Internal scratch variables in tight loops may use `number` only
  when bounded and obviously safe; convert at the boundary.
- **JSON / HTTP boundaries serialize `bigint` as a decimal string.** Never use
  `JSON.stringify` directly on a `bigint`; it throws.

## Why `bigint`, not `number`

Lightning amounts are denominated in millisatoshis. The maximum Bitcoin supply
of 21 000 000 BTC = 2.1 × 10¹⁵ msat is technically below
`Number.MAX_SAFE_INTEGER` (≈ 9.007 × 10¹⁵), so `number` would fit _individual_
balances. It does not fit safely once you start summing balances, accruing
fees, dealing with bookkeeping rollups, or accepting third-party amount fields
that may exceed 21 M BTC for protocol reasons (e.g. test vectors, regtest).

`bigint` removes the entire class of "did this amount round?" bugs without
introducing a dependency. The cost is one ergonomics paper-cut: `BigInt`
literals require an `n` suffix or a constructor call. We pay that cost.

## Why no BigNum / decimal library

Lightning protocol amounts are **integer msat**. There is no fractional msat,
no currency conversion, no FX, and no display unit smaller than msat. The
problems a decimal library solves (precise sub-unit arithmetic, banker's
rounding, lossless display formatting of decimal user input) do not appear at
the wire or protocol level.

The two places where non-integer reasoning _might_ sneak in are:

1. **Display unit conversion** (msat ↔ sats ↔ BTC) for UI. Always done from
   `bigint` msat → formatted string. Never floats. A 20-line formatter in
   `@boltwall/internal` is sufficient. See "Display formatting" below.
2. **User input parsing** ("1.5 sats", "0.001 BTC"). Reject fractional
   sub-msat input at the boundary; otherwise parse decimal strings to
   `bigint` msat without going through `Number`. A 30-line parser in
   `@boltwall/internal` is sufficient. See "Input parsing" below.

Both fall well inside the internal-utility band. Adding `bignumber.js`,
`big.js`, or `decimal.js` for a problem that fits in 50 lines of TypeScript
would import a maintenance and supply-chain tail we do not need.

## Where helpers live

| Surface                                                          | Location                     | Notes                                                                                                                                              |
| ---------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low-level conversion primitives (string ↔ `bigint`, msat ↔ sats) | `@boltwall/internal/numeric` | Private. No semantic meaning beyond unit math.                                                                                                     |
| `sats(n)`, `msats(n)`, `btc(n)` ergonomic constructors           | `@boltwall/internal/numeric` | Private workspace helpers for implementation code. Public docs should describe `bigint` msat fields, not ask consumers to import internal helpers. |
| Display formatter (`formatSats`, `formatBtc`)                    | `@boltwall/internal/numeric` | Private. Playground or other consumers read through l402 or middleware re-exports if/when needed.                                                  |
| Input parser (`parseAmount` accepting `"1500 sats"` etc.)        | `@boltwall/internal/numeric` | Private. Boundary-only; only Playground/CLI need it.                                                                                               |

Public protocol shapes (e.g. `L402PricingDecision`, `L402GateResult.invoice`,
`InvoiceRequest.amountMsat`, `BackendCapabilities.minAmountMsat`) carry
`bigint` msat fields directly. No wrapper types like `Msat<bigint>`, no
branded primitives in the current public API: branding adds friction without
catching the mistakes that actually happen (passing the wrong unit, missing the
helper).

## Helper signatures (canonical)

```ts
// @boltwall/internal/numeric — private workspace helper
export const sats  = (n: number | bigint): bigint => /* * 1000n */ ;
export const msats = (n: bigint): bigint            => n;
export const btc   = (n: number | bigint): bigint => /* * 100_000_000_000n */ ;
```

Rules:

- `sats(n)` accepts `number` for ergonomics (`sats(100)`), but rejects
  fractional input. `sats(1.5)` throws — fractional sats are nonsensical at
  the public-API surface; if the caller has a fractional intent, they meant
  `msats(1500n)` instead and should write that.
- `msats(n)` is a typecheck pass-through. It exists so call sites read
  `price: msats(100_000n)` rather than a bare numeric literal — the helper
  documents intent and lets future static-check rules find amount fields.
- `btc(n)` is the same shape as `sats`, multiplied through. Reject fractional
  BTC that would land below 1 msat resolution.

## JSON / HTTP boundaries

`JSON.stringify(0n)` throws `TypeError`. `bigint` never auto-serializes.

- **Wire format (L402 challenge headers, conformance fixtures, log lines):**
  always serialize `bigint` as a **decimal string**. Parse back with
  `BigInt(value)` at the consumer.
- **TypeScript types for serialized shapes:** declare the wire-shape type
  with `string` for any field that travels through JSON, and convert to
  `bigint` as part of the parse step. Do not let `bigint`-typed fields cross
  a JSON boundary unmarshalled.
- **Fixture vectors in `@boltwall/test-fixtures`:** numeric fields are
  authored as decimal strings; the loader parses to `bigint` so consumers
  see typed values.

The single exception: BOLT 11 invoices encode amount inside the bech32
payload itself; the BOLT 11 decoder is responsible for handing back
`bigint` msat regardless of how the underlying decoder library represents it.
The decoder choice can change, but this document binds the return type to
`bigint`.

## Display formatting

The internal formatter handles msat → sats / BTC display only. It does not
do locale-aware number formatting (separators, currency); that is a UI
concern and lives in the consumer (Playground). Formatter rules:

- Input is `bigint` msat.
- Output is a plain ASCII decimal string with no thousands separator.
- Units below 1 msat cannot exist; the input cannot represent them.
- Sats with fractional msat render with up to three decimal places, trailing
  zeros stripped (e.g. `1.234`, not `1.234000`).
- BTC renders with up to eleven decimal places (8 sat + 3 msat) in the same
  trailing-zero-stripped style.

## Input parsing

The internal parser handles user-typed amounts in the Playground / CLI. It
is **not** used on the protocol path — server middleware never parses
strings into bigint amounts; pricing config is supplied by the host
application as already-typed `bigint` msat. Parser rules:

- Accept decimal strings with optional unit suffix: `"100"`, `"100 sats"`,
  `"0.5 sats"`, `"0.0001 BTC"`. Default unit is sats when ambiguous.
- Reject anything that would resolve below 1 msat resolution.
- Reject negative numbers, NaN, scientific notation, locale separators.
- Never allocate a `Number` from the string. Multiply `bigint` factors after
  splitting on `.`.

## Anti-patterns (compile-time review checklist)

- ❌ `amountMsat: number`
- ❌ `Number(price.amountMsat)` to log or compare
- ❌ `price.amountMsat * 0.5` (mixed-mode arithmetic throws on `bigint`)
- ❌ `JSON.stringify({ amountMsat: 1000n })` (throws)
- ❌ Using `parseFloat` or `parseInt` on user-supplied amounts
- ❌ Importing `bignumber.js` / `big.js` / `decimal.js` (no use case)

## Boundary contract for new code

Every new public function or type that takes or returns a money amount must:

1. Use `bigint` for the amount field. Name the field `amountMsat` unless an
   established protocol field name applies (e.g. `mtokens` from a backend
   adapter, with conversion at the seam).
2. Add a positive and negative test if the function performs any arithmetic
   on the amount.
3. If the function crosses a JSON / HTTP boundary, document the serialized
   type in the type definition and add a round-trip test.

## Implementation boundaries

The following pieces are intentionally implementation details, even though they
support public APIs:

- `@boltwall/internal/numeric` owns workspace-only helpers such as
  `parseAmount`, `formatSats`, `formatBtc`, and sats↔msats conversion.
- `sats`, `msats`, and `btc` are private implementation helpers, not public
  imports for package consumers.
- BOLT 11 decoder integrations must return `bigint` msat at Boltwall package
  boundaries, regardless of the underlying decoder library's native amount
  representation.

Spec references:

- [L402 protocol-specification.md](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md) — pricing and invoice amount semantics. Re-read the live document; do not work from this summary.
- [BOLT 11](https://github.com/lightning/bolts/blob/master/11-payment-encoding.md) — invoice amount encoding (multiplier, default unit sats, msat representation).
