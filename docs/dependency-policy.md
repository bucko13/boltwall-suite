# Dependency Policy

Prefer `@boltwall/internal` over external dependencies when the functionality
fits in roughly 200 lines of clear TypeScript with good unit tests.

## Decision Rule

Before adding an external package, ask whether the same functionality can be a
small internal utility. If yes, build it in `@boltwall/internal` with positive
and negative tests.

The threshold is a rough complexity boundary where maintaining a small internal
implementation is cheaper than accepting transitive dependencies, supply-chain
surface, license review, and version drift.

## Usually Internal

- Base64url encode/decode helpers.
- Hex and `Uint8Array` converters.
- Constant-time byte-array comparison.
- Small parsers, tokenizers, and validators.
- Header grammar utilities.

## Usually External

- Cryptographic primitives, such as `@noble/hashes` or WebCrypto.
- Well-established protocol implementations, such as BOLT 11 decoders or
  macaroon binary format.
- Large parsers.
- Framework integrations.

## Change Record

Every external dependency addition must justify the choice:

```text
I considered building this in @boltwall/internal but <reason>.
```

When unsure of a third-party API, look up current documentation rather than
guessing.
