# Testing

Testing should prove the behavior, not just exercise lines. Prefer focused unit
tests for local logic, integration tests for package boundaries, and e2e tests
for user-visible workflows.

## Common Commands

```sh
bun install
bun run lint
bun run typecheck
bun run test
bun run test --filter @boltwall/l402
bun run test:browser
bun run test:e2e
bun run build
bun run package-health
bun run size
```

## Expectations By Change Type

| Change type | Required tests |
|---|---|
| Bug fix | Failing regression unit test before the fix, then green after |
| New caveat helper | Positive and negative vectors; attenuation chain when applicable |
| New backend adapter | Capability flags, mock parity, unsupported capability rejection |
| New public API | Typed signature, JSDoc, compiling README example |
| Wire-format change | Spec citation, conformance fixtures, positive and negative round trips |
| Cross-runtime `@boltwall/l402` change | Browser import test and built ESM review for Node-only leakage |
| Playground UI change | Playwright e2e for the flow and desktop/mobile visual smoke |
| Pricing or invoice change | `bigint` round trip and invoice amount verification |
| Security boundary | Explicit test for that boundary |

## Browser Import Gate

`bun run test:browser` verifies built ESM imports cleanly in Playwright Chromium.
Run it for cross-runtime changes in `@boltwall/l402`.

## Good Test Shape

- Name the behavior under test.
- Cover positive and negative cases.
- Keep fixtures deterministic.
- Avoid testing implementation details unless the detail is the contract.
- Add regression tests before fixing bugs.
- Keep broad e2e tests for end-to-end confidence, not exhaustive branching.
