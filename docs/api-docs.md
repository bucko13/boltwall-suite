# Public API Documentation

Public package documentation is generated from TypeScript signatures and JSDoc.
Treat public comments as part of the API contract.

## Add JSDoc For

- exported functions
- classes
- interfaces
- type aliases
- errors
- config objects
- adapters
- framework helpers

## Document

- behavior
- important parameters
- return values
- thrown errors
- security-sensitive behavior
- compatibility behavior
- spec/source references when relevant

Keep comments factual. Do not paste long spec text; cite the relevant source and
describe local behavior.

## Compatibility Notes

Document compatibility behavior explicitly for dual LSAT/L402 challenges, legacy
LSAT parsing or emission, Aperture interop, caveat handling, and browser versus
Node constraints.

Internal helpers need comments only when behavior is subtle. Generated docs must
build cleanly before v0.1.0 stabilization.
