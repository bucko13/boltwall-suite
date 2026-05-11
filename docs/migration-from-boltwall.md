# Migration from legacy boltwall

This document tracks migration notes for the historical `bucko13/boltwall`
middleware surface. The AGPL-3.0 project is reference-only for this MIT
rewrite; compatibility behavior here is re-implemented from the L402 specs and
the MIT `lsat-js` compatibility audit, not copied from AGPL source.

## Legacy expiration caveat

Older LSAT middleware deployments used a free-form `expiration=<unix-ms>`
caveat. Current L402 code should use the standard `valid-until` caveat and
`validUntilSatisfier` from `@boltwall/l402` instead.

For migration-only verification of existing credentials, import the deprecated
helpers from the legacy subpath:

```ts
import { expirationCaveat, expirationSatisfier } from "@boltwall/l402/legacy";
```

The helper preserves the legacy wire shape:

```text
expiration=1577228778197
```

The satisfier treats later `expiration` caveats as valid attenuation only when
they shorten or preserve the previous deadline. New protocol code should not
mint this caveat; it exists so existing LSAT-style macaroons can be evaluated
while callers migrate to `valid-until`.
