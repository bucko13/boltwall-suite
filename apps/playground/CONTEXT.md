# Playground — Context Glossary

A glossary of the domain language used in the L402 playground. Definitions only —
no implementation details.

## Terms

### Artifact

Any of the three L402 values a user can paste in and work with: a **macaroon**
(bare base64), a **challenge** (a `WWW-Authenticate` header value), or a
**credential** (an `Authorization` header value, `L402 <macaroon>:<preimage>`).
Panels accept an artifact and auto-detect which of the three it is.

### Attenuate

Add a first-party caveat to an existing macaroon, producing a new, more-restricted
macaroon. Does **not** require the minting root key — this is the defining property
of macaroons.

### Caveat validation (client-side scope)

Client-side, the only caveat that can be meaningfully validated is a **time**
caveat (`valid-until` / `expiration`) — it is either expired or active relative to
now. **Service / capability caveats are server-enforced** and cannot be validated in
the playground; checking them client-side is a no-op. The playground therefore does
not present a satisfier framework — only a time-based expired/active indicator.

### Workbench

The cross-panel carrier. A value captured in one panel (e.g. an artifact from the
Demo) is held in the workbench so another panel can load it. Panels never auto-sync
their inputs to the workbench; a value enters a panel input only via an explicit
"Fill from workbench" action.

Producer panels may auto-stage their own newly created outputs to the Workbench
when creating those outputs is the panel's primary purpose. Imported or external
artifacts require an explicit "Add to Workbench" action before they enter the
Workbench.

### Fill from Workbench

Copy a Workbench value into the current panel input.

### Add to Workbench

Stage an imported or transformed artifact into the Workbench so another panel can
load it.

### Save revision

In Caveats, save the current attenuation into local linear history. Saving a
revision does not mint a macaroon and does not stage anything to the Workbench by
itself.

### Conversion

Producing one artifact form from another: a macaroon → its **challenge** form
(requires an invoice) or → its **credential** form (requires a preimage). Neither
requires the minting root key. (Distinct from minting, which creates a fresh
macaroon from a root key.)
