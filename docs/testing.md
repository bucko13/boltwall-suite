# Testing

Tests prove behavior. Prefer focused unit tests for local logic, integration
tests for package boundaries, and e2e tests for user-visible flows. This
document is the authoritative reference for every test surface in the repo.
**Keep it current: adding a new test surface without updating this doc means
the acceptance criteria for that work are not met.**

---

## Quick Reference

| Command                                       | What it covers                     | Prerequisites                     | Runs in CI?           |
| --------------------------------------------- | ---------------------------------- | --------------------------------- | --------------------- |
| `bun run test`                                | Unit tests, all packages           | None                              | ✓ every push          |
| `bun run test --filter @boltwall/l402`        | l402 unit tests only               | None                              | ✓                     |
| `bun run test:browser`                        | l402 ESM bundle import in Chromium | Built l402 (`bun run build`)      | ✓ every push          |
| `bun run test:e2e` (from `apps/playground`)   | Playground UI flows end-to-end     | Node.js (dev server auto-started) | Planned Phase 9       |
| `bun run test:interop` (from `packages/l402`) | Aperture live protocol interop     | Docker + LND regtest node         | ✓ on l402/fixture PRs |
| `bun run package-health`                      | publint + arethetypeswrong         | Built packages                    | Manual                |
| `bun run size`                                | @boltwall/l402 bundle size budget  | Built l402                        | Manual                |

---

## Playwright Server Reuse

Browser and e2e Playwright configs start their own local servers by default.
Set `PLAYWRIGHT_REUSE_SERVER=1` only when you intentionally want to run against
an already-running local server. Playground e2e also accepts
`PLAYWRIGHT_PORT=<port>` to choose a non-default port.

---

## Unit Tests

**What:** Pure function tests with no external dependencies. Cover parsing,
encoding, crypto, satisfiers, caveats, and all `@boltwall/l402` protocol logic.

**Location:**

- `packages/l402/test/*.test.ts` — main unit suite
- `packages/l402/test/adversarial/` — tamper/edge-case vectors
- `packages/l402/test/interop/aperture-smoke.test.ts` — Aperture library
  vector tests (static byte comparison against known Aperture output; no live
  server required)
- `packages/adapters/test/` — adapter interface, MockAdapter, LndAdapter unit
- `packages/internal/test/` — shared utility tests
- `packages/middleware/test/` — middleware unit tests

**Run:**

```sh
bun run test                             # all packages
bun run test --filter @boltwall/l402    # single package
```

**CI:** Runs on every push as the `Test` step in `.github/workflows/ci.yml`.

---

## Browser Runtime Tests

**What:** Verifies the `@boltwall/l402` built ESM bundle imports and executes
correctly in a real Chromium browser via Playwright. Catches bundler shims,
Node.js-only API leakage (`Buffer`, `process`, `crypto` node: prefix), and
runtime behavior differences between Node and browser.

This is distinct from unit tests: even if unit tests pass, the built bundle can
fail to import or silently misbehave in a browser environment.

**Location:** `packages/l402/test/browser/import.spec.ts`

**Run:**

```sh
# From repo root — turbo builds l402 first automatically:
bun run test:browser --filter @boltwall/l402

# Or manually from packages/l402:
bun run build && bun run test:browser
```

**Prerequisites:** Built l402 bundle (turbo handles this automatically).

**CI:** Runs on every push as the `Browser import` step in `ci.yml`.

**When required:** Any change to `@boltwall/l402` that touches runtime
behavior, exports, or dependencies. See the expectations table below.

---

## Playground E2E Tests

**What:** Playwright tests that exercise the playground workbench UI against
a running Next.js dev server. Covers design system primitives, theme
persistence, L402 browser API behavior, and workbench panel flows.

**Location:** `apps/playground/test/e2e/`

| Spec file              | What it covers                                                  |
| ---------------------- | --------------------------------------------------------------- |
| `design.spec.ts`       | Design system primitives, theme toggle, persistence, focus      |
| `l402-browser.spec.ts` | L402 API correctness in the browser bundle (using fixture data) |
| `panels/`              | Per-panel fixture-driven interaction specs (bw-0dw.6)           |

**Run:**

```sh
# From repo root:
bun run test:e2e --filter @boltwall/playground

# Or from apps/playground:
bun run test:e2e
```

**Prerequisites:** None — Playwright config starts the Next.js dev server automatically.

**CI:** Planned for Phase 9 stabilization gate. Not yet in `ci.yml`.

---

## Aperture Interop Tests

**What:** Live HTTP tests that exercise `@boltwall/l402` against a
containerised [Aperture](https://github.com/lightninglabs/aperture) instance
(the Go reference L402 proxy). Catches wire-format divergence between our
implementation and what Aperture produces or accepts — the most critical
spec-compliance check in the repo.

These tests are **intentionally excluded from `bun run test`**. They are
isolated behind a `test:interop` script and a module-level guard that fails
loudly if invoked outside that script. This keeps normal test output clean
and makes the infrastructure requirement explicit.

**Location:** `packages/l402/test/interop/aperture-pr.test.ts`

**Scenarios:**

1. GET protected resource → 402 with parseable L402 challenge
2. Challenge macaroon → valid v0 identifier via `decodeIdentifier`
3. `buildAuthorizationHeader` from challenge → Aperture accepts (strictverify=false)
4. Tampered macaroon → Aperture returns 401
5. LSAT-scheme challenge header → parses identically to L402
6. Multi-macaroon Authorization header → `parseAuthorizationHeader` accepts

**Prerequisites:**

- Docker
- A running LND regtest node with the following exported:
  - `LND_TLS_CERT` — path to your LND `tls.cert`
  - `LND_MACAROON_DIR` — path to your LND macaroon directory

**Run:**

```sh
# Step 1: start the Aperture + backend Docker stack
LND_TLS_CERT=/path/to/tls.cert \
LND_MACAROON_DIR=/path/to/macaroon-dir \
docker compose \
  -f packages/test-fixtures/aperture-smoke/docker-compose.yml \
  up -d --build

# Step 2: run the tests (from packages/l402)
cd packages/l402
bun run test:interop

# Or use the orchestration script from repo root:
LND_TLS_CERT=/path/to/tls.cert \
LND_MACAROON_DIR=/path/to/macaroon-dir \
packages/test-fixtures/aperture-smoke/run-interop.sh
```

**Tear down:**

```sh
docker compose \
  -f packages/test-fixtures/aperture-smoke/docker-compose.yml \
  down --volumes
```

**CI:** `.github/workflows/compat-aperture.yml` — triggers on PRs that touch
`packages/l402/**`, `packages/test-fixtures/**`, or the workflow file itself,
and on `workflow_dispatch`. Requires `LND_TLS_CERT` and `LND_MACAROON_DIR`
configured as GitHub Actions secrets.

---

## Package Health

**What:** Two tools run in sequence:

- **[publint](https://publint.dev/)** — validates `package.json` exports,
  `main`/`module` fields, and that all advertised entry points resolve.
- **[Are The Types Wrong?](https://arethetypeswrong.dev/)** — validates that
  TypeScript types are correct for all export conditions (ESM, CJS, etc.).

**Run:**

```sh
bun run package-health                           # all publishable packages
bun run package-health --filter @boltwall/l402   # single package
```

**CI:** Manual (not yet in `ci.yml`). Required before any publishable package release.

---

## Bundle Size

**What:** [size-limit](https://github.com/ai/size-limit) enforces a 150 KB
gzipped budget on the `@boltwall/l402` dist bundle.

**Run:**

```sh
bun run size --filter @boltwall/l402
# Or from packages/l402:
bun run size
```

**CI:** Manual (not yet in `ci.yml`). Run before releasing `@boltwall/l402`.

---

## Expectations By Change Type

| Change type                           | Required                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Bug fix                               | Failing regression unit test before the fix, green after               |
| New caveat helper                     | Positive and negative vectors; attenuation chain where applicable      |
| New backend adapter                   | Capability flags, mock parity, unsupported capability rejection        |
| New public API                        | Typed signature, JSDoc, compiling README example                       |
| Wire-format change                    | Spec citation, conformance fixtures, positive and negative round trips |
| Cross-runtime `@boltwall/l402` change | `bun run test:browser` + ESM bundle review for Node-only leakage       |
| Playground UI change                  | Playwright e2e for the flow; desktop + mobile smoke                    |
| Pricing or invoice change             | `bigint` round trip and invoice amount verification                    |
| Security boundary                     | Explicit test that proves the boundary holds                           |
| New test surface or runner            | Update this document (see below)                                       |

---

## Adding a New Test Surface

When a task introduces a new test type, runner, `test:*` script, or
infrastructure dependency:

1. **Add a `test:<surface>` script** to the relevant `package.json`. Do not
   mix infrastructure-dependent tests into the default `test` glob.
2. **Add to `turbo.json`** only if the surface should run via turbo task
   propagation (most infra-dependent surfaces should not).
3. **Update this document:**
   - Add a row to the Quick Reference table.
   - Add a new section with: what it covers, location, run command,
     prerequisites, and CI status.
   - Update the Expectations By Change Type table if relevant.
4. **Update contributor guidance** if the new surface changes required
   validation for specific change types.
5. **Add a CI job or step** if the surface should run automatically.

Missing this step means the task's acceptance criteria are not met.

---

## Good Test Shape

- Name the behavior under test, not the implementation.
- Cover positive and negative cases.
- Keep fixtures deterministic; prefer `@boltwall/test-fixtures` over ad-hoc vectors.
- Avoid testing implementation details unless the detail is the contract.
- Add regression tests before fixing bugs.
- Keep broad e2e tests for end-to-end confidence, not exhaustive branching.
- New caveat helpers ship with positive AND negative vectors, including
  attenuation chains where applicable.
- New backend adapters ship with capability flags accurate to the implementation.
