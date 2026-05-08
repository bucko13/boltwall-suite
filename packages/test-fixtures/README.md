# @boltwall/test-fixtures

Private fixture package for Boltwall Suite protocol and interoperability tests.

This package is the single source of truth for wire-format and protocol fixtures
used across the repo. Packages should consume shared fixtures from here instead
of inventing package-local copies of headers, credentials, caveats, or
malformed examples.

Fixtures that belong here:

- L402 and legacy LSAT challenge/authorization header examples
- Parser negative cases for malformed headers
- Multi-macaroon authorization examples
- Identifier boundary cases
- Caveat attenuation chains such as `satisfyPrevious`
- Aperture interoperability captures
- MIT-safe legacy `lsat-js` behavior fixtures when needed

Rules:

- No protocol package should maintain its own private wire vectors.
- Keep fixtures small, explicit, and named for the behavior they prove.
- Add positive and negative cases together when protocol behavior is subtle.
- Treat this package as test-only support code, not production runtime logic.
