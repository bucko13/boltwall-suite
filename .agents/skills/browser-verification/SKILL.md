---
name: browser-verification
description: Run Boltwall Suite browser, Playwright, and playground e2e validation from task worktrees while avoiding stale dev servers, permission failures, and lockfile churn.
---

# Browser Verification

Use this skill whenever a Boltwall task requires Playwright, browser import,
playground e2e, or manual browser verification.

## Worktree First

Run browser validation from the task worktree that contains the code under test,
not from the canonical checkout. Keep Agent Mail and Beads commands in the
canonical checkout.

Before starting a Playwright run that owns a dev server, check whether the port
is already in use:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:31333 -sTCP:LISTEN
```

Only stop a process you started or a process the owner explicitly tells you to
stop. If another agent owns the listener, coordinate through Agent Mail.

## Playground E2E

Use the CI-shaped command by default so Playwright starts the server for the
current worktree and does not reuse a stale server from another checkout:

```sh
CI=1 bun run --cwd apps/playground test:e2e
```

To intentionally reuse an existing local server, set the opt-in flag:

```sh
PLAYWRIGHT_REUSE_SERVER=1 bun run --cwd apps/playground test:e2e
```

When another agent owns port 3000, use a different port instead of stopping
their server:

```sh
CI=1 PLAYWRIGHT_PORT=3100 bun run --cwd apps/playground test:e2e
```

For focused playground specs, prefer the stable helper command so local
permission approvals can target one fixed command prefix while the port and spec
remain arguments:

```sh
bash .agents/skills/browser-verification/scripts/playground-e2e 3100 test/e2e/panels/demo.spec.ts
```

The first argument is the Playwright dev-server port. All remaining arguments
are passed to Playwright after `--`.

## L402 Browser Import

Build the package first, then run the browser import test:

```sh
bun run test:browser --filter @boltwall/l402
```

If running inside `packages/l402` directly:

```sh
bun run build
bun run test:browser
```

Set `PLAYWRIGHT_REUSE_SERVER=1` only when intentionally testing against an
already-running bundle server that belongs to the same worktree.

## Manual Browser Pass

Start the dev server from the task worktree, then run the reusable smoke script
instead of an inline Node command:

```sh
node .agents/skills/browser-verification/scripts/browser-smoke.mjs http://127.0.0.1:3100
```

Set `BROWSER_SMOKE_SELECTOR` when the page does not have a `main` landmark:

```sh
BROWSER_SMOKE_SELECTOR="#root" node .agents/skills/browser-verification/scripts/browser-smoke.mjs http://127.0.0.1:3100
```

The smoke script checks:

- page load success
- page errors and app console errors
- a stable page selector on desktop and mobile

For UI changes, add a human screenshot/layout pass for expected UI state and
obvious desktop/mobile overlap or clipped text.

Known nonblocking local noise:

- Next dev `allowedDevOrigins` messages
- React DevTools informational logs
- `NO_COLOR` / `FORCE_COLOR` warnings

Page errors, failed network requests for app-owned resources, and app console
errors remain blockers.

## Permission Failures

If Playwright or Chromium fails because of sandbox permissions, request
escalation for the same stable command. Do not replace it with a long inline
Node script, skip browser validation, or switch package managers.

If Bun fails because it cannot create temp/cache files, request escalation for
the same command or set an owner-approved temp directory. Do not use npm, yarn,
or pnpm.

## Lockfile Churn

`bun install`, `bun x`, and Playwright setup can touch `bun.lock` in a worktree.
Unless you are on a lockfile reconcile bead, restore `bun.lock` before staging:

```sh
git restore bun.lock
```

Never stage `bun.lock` outside the reconcile task.
