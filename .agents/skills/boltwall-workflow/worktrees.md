# Git Worktrees

This document describes the repository's Git worktree mechanics. The pattern is
simple: keep one primary checkout for shared project state and create focused
worktrees for isolated changes.

## Terms

- **Primary checkout:** the normal repository checkout where shared project
  state is inspected and new worktrees are created.
- **Task worktree:** a git worktree created for one focused change.
- **Worktree root:** an owner- or environment-configured directory outside the
  repository checkout where task worktrees live.
- **Namespace:** the short branch namespace used to group related task branches.

## Naming

Use names that describe ownership and task identity:

```text
<worktree-root>/<namespace>/<task-id>
<namespace>/<task-id>-<short-topic>
```

Do not create task worktrees inside the repository checkout.

## Before Creating A Worktree

From the primary checkout:

```sh
git status --short --branch
git log --oneline -10
git worktree list --porcelain
git fetch origin
```

Before creating the worktree, inspect the existing worktree list for the task
identifier anywhere in path or branch names. If a same-task worktree already
exists, coordinate before creating another one. If the exact path or branch
already exists, stop and inspect. Do not delete, overwrite, force, or reuse
someone else's worktree.

## Create The Worktree

```sh
git worktree add <worktree-root>/<namespace>/<task-id> \
  -b <namespace>/<task-id>-<short-topic> origin/<integration-branch>
```

## Bootstrap The Worktree

Before running package or app validation, make the new worktree usable from its
own checkout:

```sh
cd <worktree-root>/<namespace>/<task-id>
bun install --frozen-lockfile
bun run build
```

This avoids the common failure where a fresh worktree starts task validation
before workspace dependencies and package build outputs exist. Run task-specific
tests only after this bootstrap, unless the task is docs-only and never imports
workspace packages.

If `bun install --frozen-lockfile` fails because the lockfile is stale, do not
commit `bun.lock` as part of an unrelated implementation change.

## Work

In the task worktree:

```sh
git status --short --branch
```

Keep the primary checkout free of implementation edits. Review the changed file
set frequently with `git status --short` so generated artifacts and unrelated
local changes are easy to spot.

## Land

When work is ready:

1. Run required validation in the task worktree.
2. Review `git status --short --branch` and `git diff`.
3. In the task worktree:
   ```sh
   git fetch origin
   git rebase origin/<integration-branch>
   ```
4. Re-run validation affected by the rebase.
5. Stage only reviewed paths and commit with a clear summary.
6. Land according to the active integration mode. Boltwall Suite is currently
   in **direct integration mode** until the owner flips the project to
   PR-gated mode for production:
   - **Direct integration mode:** push the validated commit to `main`.
   - **PR-gated mode:** push the task branch, open a PR, and land only after
     required checks and review pass.
7. Verify the landed commit is visible on the remote.

Never switch the primary checkout to the task branch to land work. Never
force-push unless the repository's maintainer explicitly requests it.

## Shared Surfaces

Worktrees isolate branches and local artifacts. They do not remove coordination
requirements for shared semantic chokepoints such as package barrels, public
index files, `bun.lock`, root configs, workflow files, fixture indexes, or
generated public API/config surfaces.

## Cleanup

After landing, confirm the worktree is clean:

```sh
git status --short
```

Then remove the clean task worktree from the primary checkout:

```sh
git worktree remove <worktree-path>
```

Do not remove a worktree with uncommitted changes.
