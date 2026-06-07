---
name: pr-commit-writing
description: Use when writing commit messages, PR titles, PR descriptions, merge notes, or validation notes. Keeps text concise, human, and focused on feature behavior instead of CI command repetition.
---

# PR And Commit Writing

Use this whenever you write a commit, PR, merge note, release note, or validation
section.

## Defaults

- Be concise. Write for humans reviewing the change.
- Say what changed and why it matters. Skip process narration.
- Do not mention the agent, tool, branch drama, or implementation journey.
- Do not use verbose bullet trees when one sentence or two bullets is enough.
- Prefer specific nouns over broad labels like "improve" or "update".

## Commits

Use one clear subject line:

```text
feat(playground): fill generate from workbench
fix(playground): sync validate preimage
chore: add playground changeset
```

Rules:

- Keep the subject under about 72 characters when practical.
- No body unless it adds necessary context that is not obvious from the diff.
- If a body is needed, keep it to one short paragraph or a few direct bullets.
- Never pad commits with validation logs.

## PR Titles

Use the same style as commit subjects:

```text
feat(playground): fill generate from workbench
```

## PR Descriptions

Use this shape by default:

```md
## Summary
- What the user can do now.
- Important behavior change or guardrail.

## Validation
- User workflow that proves the feature works.
- Edge case or regression path checked.
```

Keep it short. Add sections only when they carry real review value, such as
`Spec`, `Security`, or `Migration`.

## Validation Sections

Validation is not a list of CI commands. CI already runs lint, typecheck, tests,
build, and Changesets checks.

Write validation as user-observable workflow proof:

```md
## Validation
- In Validate, paste an Authorization credential and confirm the preimage field is populated.
- Fill a Workbench credential into Validate and confirm verification uses that preimage.
- With a macaroon plus matching preimage, confirm "Add credential to Workbench" stores the credential.
```

For UI changes, include:

- the screen or panel visited
- the input or state used
- the visible result checked
- any stale-state or regression path that previously failed

Mention CI-style commands only when they are the only meaningful validation, or
when a local run found something CI does not cover. Even then, keep them below
the workflow validation.

## Bad Patterns

Avoid:

```md
## Validation
- bun run lint --filter @boltwall/playground
- bun run typecheck --filter @boltwall/playground
- bun run build --filter @boltwall/playground
```

Prefer:

```md
## Validation
- Seed Workbench with a challenge and credential, then fill Generate from Workbench.
- Confirm the signing key, invoice, and preimage inputs populate and disabled states are correct.
```
