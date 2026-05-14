# Agent Worktrees

This is the default workflow for Boltwall Suite task edits. It keeps one
canonical checkout for coordination and gives each task its own git worktree for
implementation.

`AGENTS.md` remains the authority. This document explains the mechanics.

## Terms

- **Canonical checkout:** the checkout where the session starts, inbox is
  checked, Beads is updated, and task worktrees are created.
- **Canonical project key:** the stable Agent Mail project key for this
  repository. In local MCP setups this is often the canonical checkout path, but
  agents must treat it as a shared coordination identifier, not derive it from a
  task worktree path.
- **Task worktree:** a git worktree created for one bead's implementation.
- **Worktree root:** an owner- or environment-configured directory outside the
  repository checkout where task worktrees live.
- **Agent namespace:** the short branch namespace for the registered agent or
  runtime. Use the project-provided namespace when one exists; otherwise use a
  lowercase, URL-safe form of the Agent Mail name.

## Naming

Use names that describe ownership and task identity without assuming a specific
agent runtime:

```text
<worktree-root>/<agent-namespace>/<task-id>
<agent-namespace>/<task-id>-<short-topic>
```

Do not create task worktrees inside the repository checkout. Do not use a task
worktree path as the Agent Mail project key.

## Startup

Run coordination from the canonical checkout:

```sh
git status --short --branch
git log --oneline -10
```

Then:

1. Ensure/register/fetch Agent Mail with the canonical project key.
2. Handle inbox.
3. Run `bv --robot-triage`.
4. Claim with `br update <id> --claim --actor <agent>`.
5. Reserve exact paths with Agent Mail.
6. Send a task-thread start note that includes reserved paths, validation plan,
   worktree path, branch name, and shared write surfaces.

## Beads State

Beads state is shared coordination state. Run all `br` and `bv` commands from
the canonical checkout unless the project later documents a single shared Beads
database configuration for worktrees.

Do not run Beads from a task worktree if that would create or update a separate
`.beads` database copy.

## Create The Worktree

After claim, reservation, and start note:

```sh
git worktree list --porcelain
git fetch origin
git worktree add <worktree-root>/<agent-namespace>/<task-id> \
  -b <agent-namespace>/<task-id>-<short-topic> origin/<integration-branch>
```

Before creating the worktree, inspect the existing worktree list for the
`<task-id>` anywhere in path or branch names, across every agent namespace. If a
same-task worktree already exists, coordinate in the task thread before creating
another one. If the exact path or branch already exists, stop and inspect. Do
not delete, overwrite, force, or reuse another agent's worktree.

## Bootstrap The Worktree

Before editing, make the new worktree usable from its own checkout:

```sh
cd <worktree-root>/<agent-namespace>/<task-id>
bun install --frozen-lockfile
bun run build
```

This avoids the common failure where a fresh worktree starts task validation
before workspace dependencies and package build outputs exist. Run task-specific
tests only after this bootstrap, unless the task is docs-only and never imports
workspace packages.

If `bun install --frozen-lockfile` fails because the lockfile is stale, do not
update or commit `bun.lock` from a normal implementation task. Record the
lockfile-reconcile dependency and use the existing reconcile workflow. If Bun or
git cannot write the worktree, cache, tempdir, or `.git/worktrees` metadata,
request permission for the blocked command rather than editing in the canonical
checkout.

## Work

In the task worktree:

```sh
git status --short --branch
```

Re-read reserved files before editing. Edit only reserved paths. Reserve new
files before creating them. Keep the canonical checkout free of implementation
edits.

Re-check Agent Mail after meaningful pauses and before touching shared write
surfaces. On reservation conflict, coordinate instead of editing through it.

## Land

When work is ready:

1. Run required validation in the task worktree.
2. Review `git status --short --branch` and `git diff`.
3. Run `br sync --flush-only` from the canonical checkout.
4. In the task worktree:
   ```sh
   git fetch origin
   git rebase origin/<integration-branch>
   ```
5. Re-run validation affected by the rebase.
6. Stage only reviewed reserved paths and commit with the task id and validation
   summary.
7. Land according to the active integration mode:
   - **Direct integration mode:** push the commit to the integration branch.
   - **PR-gated mode:** push the task branch, open a PR, and land only after
     required checks and review pass.
8. Verify the landed commit is visible on the remote.
9. Close the bead only after the remote landing succeeds.
10. Release reservations only after no reserved file remains locally modified.
11. Send completion mail with summary, validation, commit hash, branch, worktree
    path, and released paths.

Never switch the canonical checkout to the task branch to land work. Never
force-push.

## Shared Surfaces

Worktrees isolate branches and local artifacts. They do not remove coordination
requirements for shared semantic chokepoints such as package barrels, public
index files, `bun.lock`, root configs, workflow files, fixture indexes, or
generated public API/config surfaces. Follow the shared-surface policies in
`AGENTS.md`.

## Cleanup

After landing or an explicit handoff, record the cleanup intent in the task
thread:

- worktree path
- branch name
- commit hash or handoff state
- confirmation that `git status --short` in the worktree is clean

Then the same agent may remove its own clean task worktree with:

```sh
git worktree remove <worktree-path>
```

This is the only standing cleanup exception. Do not use `rm`, do not delete
branches, and do not remove a worktree with uncommitted changes.
