# GitHub Actions Hygiene

These rules harden the suite against supply-chain attacks of the Shai-Hulud / mini Shai-Hulud class (worm-style npm/PyPI compromises, OIDC token theft from Actions runners, `pull_request_target` abuse, install-script payloads). They are enforceable in PR review; cite this doc when blocking a workflow change.

`AGENTS.md` routes workflow-touching tasks here. Read this file before editing anything under `.github/workflows/` or adding a new third-party action.

## Hard rules

### 1. Pin every action to a 40-char commit SHA

Use the full 40-char commit SHA with the floating tag preserved in a trailing comment:

```yaml
uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
```

Tag refs (`@v4`, `@main`, `@master`) and short SHAs are forbidden — in new third-party actions and in updates to existing ones. Renovate/Dependabot updates must preserve the SHA + comment shape; reject PRs that drop the comment or rewrite a SHA back to a tag.

This applies to every `uses:` line, including reusable workflows, composite actions, and Docker-based actions.

### 2. Top-level least-privilege `permissions:` block

Every workflow file MUST declare a top-level `permissions:` block. Default to:

```yaml
permissions:
  contents: read
```

Per-job overrides are allowed only when narrowly justified by a specific step (e.g., `checks: write` for a status-publisher, `pull-requests: write` for a comment-bot). Document the reason inline.

**Only the release workflow may hold `id-token: write`**, and only on the job that actually requests an OIDC token. Never grant it at the top level.

### 3. CI installs use `--ignore-scripts` and `--frozen-lockfile`

Install steps MUST pass `--ignore-scripts` and `--frozen-lockfile`, or run from a tree where `bunfig.toml` enforces `ignoreScripts = true` (which this repo does — see `bunfig.toml`) and the install command is `bun install --frozen-lockfile`.

Lifecycle scripts (`preinstall` / `install` / `postinstall` / `prepare`) are an active malware vector. The bunfig setting blocks them locally; CI must not bypass it.

### 4. `pull_request_target` requires owner sign-off

New workflows triggered by `pull_request_target` require explicit owner sign-off in the PR description. The trigger grants write-scoped tokens to untrusted PR code and is a documented exploitation path for the worm-class attacks this doc defends against. Default to `pull_request` (no secrets, read-only token) unless the workflow truly needs a write token, and even then escalate first.

## Coordination

Workflow files are a shared write surface (see `AGENTS.md` RULE 2). Reserve them through Agent Mail with a short critical section — reserve → re-read → edit → commit → release — and do not hold the reservation while the file remains locally modified.

## Reference

- `bunfig.toml` — `minimumReleaseAge` (7-day install gate) and `ignoreScripts` baseline.
- `docs/dependency-policy.md` — provenance-is-not-trust framing and the inbound-dependency vetting checklist.
- Mini Shai-Hulud writeups: <https://thehackernews.com/2026/05/mini-shai-hulud-worm-compromises.html>, <https://www.stepsecurity.io/blog/mini-shai-hulud-is-back-a-self-spreading-supply-chain-attack-hits-the-npm-ecosystem>, <https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised>.
