---
name: boltwall-workflow
description: Execute Boltwall Suite's mandatory agent workflow from session start through landing. Use when starting or resuming work in /Users/wintermute/repos/boltwall-suite, claiming task work, reserving files through Agent Mail, validating changes, closing tasks, releasing reservations, committing, or pushing.
---

# Boltwall Workflow

This is the self-contained happy-path runbook for agents working in Boltwall
Suite. It implements the repository workflow required by `AGENTS.md`; it does
not replace that contract.

## Authority

1. Live L402 specs govern protocol semantics.
2. `AGENTS.md` governs repository policy.
3. Repo-local skills and docs explain how to execute the policy.
4. Global skills and generic habits are lower authority.

If a lower source conflicts with a higher source, follow the higher source. If
the rule is ambiguous, stop and ask the owner or open a blocker task.

## Session Start

Run these before task triage, claim, or edits:

1. Read `AGENTS.md` end-to-end before making any change.
2. Check repo state:
   ```sh
   git status --short --branch
   git log --oneline -10
   ```
3. Join Agent Mail with MCP tools or macros:
   - `ensure_project(human_key="<repo-root>")`
   - `register_agent(project_key="<repo-root>", ...)`
   - `fetch_inbox(project_key="<repo-root>", agent_name="<agent>")`
4. Handle inbox items addressed to you.
5. Run `bv --robot-triage` or another `bv --robot-*` command. Never run bare
   interactive `bv` in an automated agent session.

Agent Mail operations use MCP tools, macros, and resources. The Agent Mail CLI is
for admin/config/docs/share/archive/doctor style operations unless a reliable
runtime bridge is explicitly available.

## Claim

Choose ready work from `bv --robot-triage` or `br ready --json`, then claim it
atomically:

```sh
br update <id> --claim --actor <agent>
```

Do not use `--status=in_progress` by itself. It can leave the assignee null and
hide ownership from peers.

## Reserve

Before editing any file, reserve the narrowest exact paths through Agent Mail:

```text
file_reservation_paths(
  project_key="<repo-root>",
  agent_name="<agent>",
  paths=["path/one", "path/two"],
  ttl_seconds=3600,
  exclusive=true,
  reason="<task-id>"
)
```

After the reservation is granted, re-read every reserved file before editing.
For shared write surfaces (`bun.lock`, barrels, root config, shared fixture
indexes, workflow files, generated public API/config surfaces), keep the
reservation short: reserve, re-read, edit, validate, commit, release.

When `bun.lock` is reserved for a lockfile reconcile, do not edit workspace
`package.json` files until the reservation is released.

## Announce

Post a start note in the task thread:

- `thread_id="<task-id>"`
- subject prefix: `[<task-id>] Start: <short title>`
- body: claimed task, reserved paths, intended scope, validation plan.

If contact policy blocks peer broadcast, send a self-addressed thread note and
document the fallback. Missing peer delivery is not permission to skip the
coordination record.

## Work Loop

While working:

- Stay inside task scope.
- Re-check inbox after meaningful pauses or before touching shared surfaces.
- Renew reservations before expiry if still actively editing.
- On `FILE_RESERVATION_CONFLICT`, do not edit the conflicting path. Coordinate,
  narrow scope, wait for release/expiry, or defer the change.
- Record progress in the thread when it changes coordination state.
- Keep `git status --short` understandable.

## Validation Contract

Before implementation, identify the contract for the task:

- task acceptance criteria
- required tests/checks
- security boundaries
- code quality/public API expectations
- relevant docs
- relevant live L402 spec sections for protocol work

Run only the gates required for the change. For docs/skill-only edits, validation
can be review plus any fresh-agent exercise requested by the task. If validation
fails, stop and report the failure; do not close the task.

## Handoff

If you stop before completion, post a handoff before releasing reservations. The
handoff must include:

- current status
- files changed or reserved
- validation already run
- validation still needed
- known risks or conflicts
- exact next step

Do not release a reservation while reserved files remain locally modified. If you
cannot finish and commit now, either keep the reservation and post a handoff, or
remove your local edit before releasing.

## Close And Land

When the work is complete:

1. Verify the validation contract is met.
2. Review `git status` and the diff for every file you will commit.
3. If work is not ready to land, update the task and post a handoff. Do not
   close finished work before commit and push.
4. Pull safely:
   ```sh
   git pull --rebase
   ```
5. Sync local task export:
   ```sh
   br sync --flush-only
   ```
6. Stage only reviewed paths:
   ```sh
   git add <path>...
   ```
7. Commit with the task id and validation summary.
8. Push:
   ```sh
   git push
   git status --short --branch
   ```
9. Close completed work only after the push succeeds:
   ```sh
   br close <id> --reason "Completed: <summary>"
   ```
10. Release reservations only after close/handoff conditions are met and no
   reserved file remains locally modified.
11. Send completion mail in the task thread with summary, validation, commit
    hash, and released paths.

Work that changes tracked files is not complete until the push succeeds.

## Fallbacks

If skill support is unavailable, read `AGENTS.md` and this file directly.

If MCP Agent Mail tools are unavailable, preserve the outcomes:

- stable agent identity in task actor fields
- explicit reservation-equivalent intent in task notes or thread comments
- no overlapping edits
- clear handoffs
- documented fallback used

Agent Mail fallback rules:

- MCP Agent Mail tools, macros, and resources are the normal path for identity,
  inboxes, messages, reservations, and releases.
- The Agent Mail CLI is for admin/config/docs/share/archive/doctor style
  operations unless a reliable runtime bridge is explicitly available.
- If contact policy blocks peer broadcast, use the tool's contact request path
  when available, record an equivalent self-addressed task-thread note, and
  mention the fallback in completion notes.
- If MCP Agent Mail is unavailable, do not claim a reservation, inbox check, or
  message was completed. Preserve the coordination outcome with explicit
  task-thread or task-note fallback, and do not edit until overlap risk is
  resolved.

If `bv` is unavailable, use `br ready --json`, `br show --json`, and explicit
dependency checks. Do not run interactive TUI commands in automation.

## Scripts

Helper scripts live in `scripts/` beside this skill. They accelerate the
workflow but do not define policy. Run each with `--help` before use.

```sh
.agents/skills/boltwall-workflow/scripts/start-session --dry-run
.agents/skills/boltwall-workflow/scripts/start-task --task <id> --paths <path> --dry-run
.agents/skills/boltwall-workflow/scripts/handoff-template --task <id>
.agents/skills/boltwall-workflow/scripts/landing-checklist --dry-run
.agents/skills/boltwall-workflow/scripts/validate-contract --task <id>
.agents/skills/boltwall-workflow/scripts/spec-change-check --dry-run
.agents/skills/boltwall-workflow/scripts/agent-policy-check
```

The scripts print required MCP calls as unverified unless the script actually
has a runtime bridge for that MCP action.

If a task requires fresh-subagent validation and subagents are unavailable, stop
and ask the owner before substituting a weaker validation.
