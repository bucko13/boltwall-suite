---
name: l402-protocol-work
description: Perform Boltwall Suite L402 protocol-sensitive work. Use when changing wire format, L402 or LSAT headers, macaroon handling, caveats, satisfiers, identifiers, status codes, token construction, middleware authorization semantics, or protocol conformance fixtures.
---

# L402 Protocol Work

Use this skill for Boltwall-specific protocol work. It provides the detailed
workflow behind the hard L402 invariants in `AGENTS.md`; it does not weaken or
replace them.

## Authority

For protocol semantics, live primary sources are the authority:

- L402 protocol specification: <https://github.com/lightninglabs/L402/blob/master/protocol-specification.md>
- L402 macaroon spec: <https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md>
- L402 agent spec: <https://github.com/lightninglabs/L402/blob/master/agent-spec.md>
- Aperture reference implementation: <https://github.com/lightninglabs/aperture>

Rules:

- Read the relevant live spec section before editing protocol surface.
- Do not rely on memory or existing code as the source of truth.
- Aperture is a tiebreaker only when the spec is ambiguous.
- If local code disagrees with the spec, local code is the bug unless the owner
  has documented an intentional divergence.
- If ambiguity remains after reading the spec and Aperture, stop and ask.

## Trigger Surface

Load this skill before changing:

- wire format
- `WWW-Authenticate` parsing or emission
- `Authorization` parsing or emission
- status codes for L402/LSAT flows
- macaroon binary handling
- identifier construction or parsing
- caveat parsing, serialization, semantics, or satisfiers
- token construction or serialization
- middleware authorization state machine
- L402, legacy LSAT, or dual-challenge conformance fixtures

## Required Workflow

1. Identify the protocol surface touched by the task.
2. Open the live spec section that governs that surface.
3. Record the section citation needed for the change record, for example:
   `L402 protocol-specification.md §<section>`.
4. Inspect current code only after establishing the spec reading.
5. If the spec is ambiguous, inspect Aperture as tiebreaker and document the
   exact source path or URL used.
6. Plan fixture and test impact before editing.
7. Edit the smallest package that owns the behavior.
8. Validate with the matrix below.
9. Include spec citation, fixture impact, validation, and any Aperture ambiguity
   note in the commit or PR record.

## Fixtures And Tests

Wire-format or auth-flow changes must update `@boltwall/test-fixtures` when
vectors change. Cover every applicable shape:

- L402 challenge and credential forms
- legacy LSAT challenge and credential forms
- dual-challenge emission and parsing
- multi-macaroon cases where relevant
- positive and negative round trips
- malformed input rejection

For caveat helpers:

- positive vectors
- negative vectors
- attenuation chains, including `satisfyPrevious` where applicable
- unknown caveat behavior

For middleware authorization semantics:

- missing credential returns 402 challenge
- invalid credential returns 401
- invalid preimage returns 401
- caveat rejection returns 401
- invoice/provider failures map to the documented error kinds
- configured price matches bolt11 amount
- credentials and preimages are not logged at info level

For `@boltwall/l402` cross-runtime changes:

- unit tests
- build
- Playwright Chromium browser import test
- review built ESM for accidental `node:*` or `Buffer` leakage where browser
  compatibility is relevant

## Security Invariants

- Unknown caveats are skipped when no satisfier matches. Never rely on unknown
  caveats failing closed.
- Server verification paths use constant-time comparison for signature and
  payment-hash equality.
- Public L402/browser APIs use `Uint8Array` and `string`, not `Buffer`.
- Lightning amounts use `bigint` millisatoshis, not `number` sats.
- Macaroons, preimages, root keys, invoices with sensitive metadata, and backend
  credentials must not be logged at info level.
- Middleware must verify the bolt11 amount matches the configured price.

## AGPL And Legacy Sources

Legacy `bucko13/boltwall` is AGPL reference only. Read prose, README, and
architecture diagrams if useful. Do not copy source code, code comments, tests,
or generated docs.

Legacy `Tierion/lsat-js` is MIT and may be referenced or carefully ported with
attribution where genuinely useful. Document MIT references in the change record.

Any ported behavior touching legacy Boltwall concepts must be re-implemented
from the L402 spec or from MIT `lsat-js`, not copied from AGPL source.

## Stop And Ask

Stop and ask the owner when:

- The live spec is ambiguous and Aperture does not resolve it cleanly.
- The spec and Aperture differ in a way that affects public behavior.
- Existing tests encode behavior that appears spec-divergent.
- A security boundary would need to weaken for convenience.
- A wire-format change lacks obvious fixture coverage.
- A dependency or macaroon library limitation would require vendoring or a fork.
- The change would preserve unknown-caveat fail-closed behavior.
- You cannot cite an exact spec section for protocol-surface behavior.

## Fresh-Agent Prompt Template

Use this prompt for validation or handoff of protocol-sensitive work:

```text
You are reviewing a Boltwall Suite protocol-sensitive change. Read AGENTS.md and
.agents/skills/l402-protocol-work/SKILL.md. For the proposed change, identify the
exact L402 protocol/macaroon/agent spec section to read before editing. Do not
use existing code or memory as authority. Name fixture impacts in
@boltwall/test-fixtures, tests required for L402/legacy LSAT/dual-challenge
behavior, browser import impact if @boltwall/l402 changes, and exact cases where
you would stop and ask the owner.
```

## Change Record Checklist

Include these in commits or PRs that touch protocol surface:

- task id
- exact spec citation
- affected protocol surface
- fixture changes or reason fixtures were unchanged
- tests run
- browser import validation when applicable
- Aperture tiebreaker citation if used
- AGPL note if legacy Boltwall material was consulted
