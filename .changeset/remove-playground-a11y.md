---
---

Remove accessibility testing from the playground (Lighthouse CI step, `lhci:a11y`/`test:a11y` scripts, axe-core e2e spec, `lighthouserc.json`, and the `@lhci/cli` + `@axe-core/playwright` dev dependencies). CI/test-only change in a private, unpublished app — no version bump.
