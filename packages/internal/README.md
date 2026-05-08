# @boltwall/internal

Private shared runtime utilities for Boltwall Suite.

This package exists for small cross-package helpers, usually under roughly 200
lines each, where owning the implementation is cheaper than adding another
external dependency.

What belongs here:

- Base64url helpers
- Hex and `Uint8Array` conversion helpers
- Constant-time byte comparison for browser-safe code paths
- Small parsers, tokenizers, and validators used in multiple packages

What does not belong here:

- Cryptographic primitives such as hashing or signatures
- Macaroon codec implementations
- Large parsers or framework-specific integration code
- Build or lint configuration

Cross-runtime rules:

- Code in this package must work in both Node and browser environments.
- Public helpers use `Uint8Array` and `string`, not `Buffer`.
- Utilities should ship with positive and negative tests once real code lands.

If a helper grows beyond the small-utility threshold, treat that as a signal to
move it into a dedicated workspace package instead of continuing to expand this
one.
