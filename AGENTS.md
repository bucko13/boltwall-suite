# AGENTS.md — Boltwall Suite

This file is the operational contract for AI agents working in this repository. Read it end-to-end before making any change. It supersedes general agent-coding habits where the two conflict. If anything is unclear, ambiguous, or appears wrong, **stop and ask the owner**. Do not improvise.

---

## SESSION START — RUN BEFORE TOUCHING ANY TASK

The very first actions in any new session, in this exact order, before triage or claim:

1. `mcp__mcp-agent-mail__ensure_project` (`human_key=<absolute path to this repository>`).
2. `mcp__mcp-agent-mail__register_agent` (same `project_key`, stable `agent_name`).
3. `mcp__mcp-agent-mail__fetch_inbox` — handle anything addressed to you first.
4. THEN `bv --robot-triage` to pick a task.
5. Claim atomically with `br update <id> --claim --actor <agent>` (sets `status=in_progress` AND `assignee` together — `--status=in_progress` alone leaves you anonymous).
6. Reserve files via `file_reservation_paths` BEFORE editing. Follow RULE 2 for reservation lifecycle, shared write surfaces, and handoffs.
7. Announce in-thread via `send_message(thread_id="<task-id>")` so peers can see what you're doing.

Skipping any of steps 1–3 leaves you invisible to peer agents and breaks reservation safety. Skipping step 5's `--claim` flag (using `--status=in_progress` alone) leaves the assignee field null and creates the same coordination failure even if you registered. The local happy-path runbook is `.agents/skills/boltwall-workflow/SKILL.md`.

If peer agents may have edited the tree since you last looked: run `git status` and `git log --oneline -10`, and re-read any file you plan to modify. Don't assume your mental model is current.

---

## Authority Hierarchy

When instructions conflict, apply this order:

1. The owner's latest explicit instruction.
2. This `AGENTS.md` contract.
3. The current task's exit criteria.
4. Repository docs and package READMEs.
5. Local skills and helper runbooks.
6. General agent habits or external examples.

Skills and docs explain how to execute the policy; they do not weaken or replace
the hard rules in this file.

For protocol semantics, the live L402 protocol, macaroon, and agent specs are
authoritative unless the owner explicitly documents an intentional divergence in
this repository.

## Skill Discovery Index

Use local skills when available, but keep this file's mandatory checks in view:

- `.agents/skills/boltwall-workflow/SKILL.md` for startup, task claiming,
  reservations, handoff, close, commit, push, and release sequence.
- `docs/agent-worktrees.md` for generic Git worktree mechanics.
- `.agents/skills/l402-protocol-work/SKILL.md` for protocol-sensitive work
  after reading the relevant live L402 spec sections.

Agents without skill support must still follow the explicit checklists in this
file.

---

## TOP PRIORITY — L402 SPEC COMPLIANCE

**Maintaining strict, byte-for-byte compliance with the L402 protocol specification is the single most important objective of this project. It outranks ergonomics, developer convenience, performance, brevity, and aesthetic preferences. If a change is more convenient but spec-divergent, the change is wrong.**

Authoritative sources (always read the live document — never rely on memory of the spec):

- **L402 protocol specification (canonical):** <https://github.com/lightninglabs/L402/blob/master/protocol-specification.md>
- L402 macaroon spec: <https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md>
- L402 agent spec: <https://github.com/lightninglabs/L402/blob/master/agent-spec.md>
- Lightning Labs Aperture (Go reference implementation): <https://github.com/lightninglabs/aperture>

Non-negotiable rules:

1. **Re-read the relevant spec section before any change** to wire format, header parsing/emission, status codes, `WWW-Authenticate` / `Authorization` grammar, macaroon binary handling, identifier construction, caveat semantics, satisfier behavior, or token construction. Do not work from memory or from existing code as the source of truth — the spec is the source of truth.
2. **Cite the spec section in the change record.** Every commit, PR, and inline comment that touches protocol surface MUST include a citation of the form `L402 protocol-specification.md §<section>` (or the macaroon/agent spec equivalent). Citations without a section anchor are insufficient.
3. **Spec citations beat opinions, taste, and prior code.** If existing code disagrees with the spec, the existing code is the bug. Fix it; do not preserve it.
4. **Aperture is the reference implementation tiebreaker** when the spec is ambiguous — but only as a tiebreaker. Document the ambiguity, link the Aperture source, and flag it for owner review.
5. **Conformance fixtures are load-bearing.** Any wire-format change MUST be accompanied by updated vectors in `@boltwall/test-fixtures` and round-trip tests covering L402, legacy LSAT, and dual-challenge shapes where applicable.
6. **Unknown-caveat behavior is per-spec.** Unknown caveats are skipped when no satisfier matches. Never rely on unknown caveats failing closed (see Security Boundaries).
7. **When in doubt, stop and ask.** Spec ambiguity is escalated to the owner with a documented reading of the relevant section. Do not paper over ambiguity with a plausible-looking implementation.

This priority is the lens through which every other rule in this file is read. RULE 1 below protects the working tree; this section protects the protocol.

---

## RULE 1 – ABSOLUTE (DO NOT EVER VIOLATE THIS)

You may NOT delete any file or directory unless the owner explicitly gives the exact command **in this session**.

- This includes files you just created (tests, tmp files, scratch scripts, draft fixtures, etc.).
- You do not get to decide that something is "safe" to remove.
- If you think something should be removed, stop and ask. You must receive clear written approval **before** any deletion command is even proposed.

Treat "never delete files without permission" as a hard invariant.

Narrow exception: after landing or explicit handoff, an agent may run
`git worktree remove <path>` for a clean task worktree that the same agent
created under the configured worktree root, provided the task thread records the
worktree path, branch, landing commit or handoff state, clean status, and
cleanup intent. This exception does not allow `rm`, branch deletion, force
operations, or cleanup of dirty worktrees.

---

## RULE 2 – PARALLEL WORK & HANDOFF SAFETY

This repository can be worked on by multiple agents at once. Coordination rules are correctness rules, not etiquette.

### Reservation lifecycle

Before editing any file, reserve it through Agent Mail. A reservation protects the full edit lifecycle:

1. reserve the exact path(s)
2. re-read the current file contents
3. edit
4. validate the change as required by the task
5. commit the change, or leave an explicit handoff note
6. release the reservation

Do not release a reservation while you still have uncommitted changes to that reserved file. If you cannot finish and commit the change now, either keep the reservation and hand off clearly, or remove your local edit before releasing. Never leave a shared file locally modified after releasing its reservation.

Before committing, run `git status`, review every file you are committing, and re-read any reserved file that may have changed upstream since you began.

### Shared write surfaces

The following files are shared write surfaces and must not be held casually:

- package barrel exports such as `packages/l402/src/index.ts`
- `bun.lock`
- root workspace config
- shared test fixture indexes
- GitHub workflow files
- generated public API/config surfaces used across packages

Task worktrees isolate Git state, not semantic chokepoints. These files still
need coordination because parallel commits can conflict, invalidate validation,
or fragment public API/release decisions.

Build output directories (e.g. `apps/playground/.next`, `packages/*/dist`) are **not** coordination surfaces. They are disposable artifacts. Do not reserve them, do not coordinate writes to them. The playground `build` script clears `.next` before every production build — agents never need to manage it.

For shared write surfaces, prefer deferring the change to phase-complete/reconcile work. If immediate editing is required, the reservation must cover the entire short critical section:

`reserve -> re-read -> edit -> commit -> release`

A "short reservation" is invalid if the file remains modified locally after release.

### Hand-offs

If you stop, pause, hit a blocker, or leave work unfinished, post a handoff note on the task thread before releasing any reservation. The handoff must include:

- current status
- files changed or reserved
- validation already run
- validation still needed
- known risks or conflicts
- exact next step

Do not close a task with uncommitted changes. Do not leave a task `in_progress` without a current Agent Mail thread update explaining ownership and next action.

---

## IRREVERSIBLE GIT & FILESYSTEM ACTIONS

Absolutely forbidden unless the owner gives the **exact command and explicit approval** in the same session:

- `git reset --hard`
- `git clean -fd`
- `git push --force` / `--force-with-lease`
- `git branch -D`
- `rm -rf` against any path inside the repo
- `bun pm` operations that uninstall workspace packages
- `npm unpublish`
- Any command that can delete or overwrite code, config, or data

Rules:

1. If you are not 100% sure what a command will delete or overwrite, do not propose or run it. Ask first.
2. Prefer safe tools: `git status`, `git diff`, `git stash`, copying to backups.
3. After approval, restate the command verbatim, list what it will affect, and wait for explicit confirmation before executing.
4. When a destructive command is run, record in your response:
   - The exact owner text authorizing it
   - The command run
   - When you ran it
5. If that audit trail is missing, act as if the operation never happened.

---

## Node / JS Toolchain

- Use **bun** for everything JS/TS.
- Never use `npm`, `yarn`, or `pnpm`.
- Lockfiles: only `bun.lock`. Do not introduce any other lockfile.
- Target **latest Node LTS**. No support for old Node versions.
- ESM-only. CJS output is out of scope.
- TypeScript strict mode across all packages.

---

## `bun.lock` discipline

`bun.lock` is a derived artifact. Run `bun install` locally as often as you need — local lockfile churn is fine. **Do not stage `bun.lock` in your commit.**

A designated reconcile task (label `lockfile-reconcile`) is the only thing that commits `bun.lock`. It reserves `bun.lock` briefly, runs one clean `bun install` after a wave of manifest changes has landed, validates that root `bun run typecheck`/`lint`/`build`/`test` all exit 0, and commits the resulting lockfile. Reconcile tasks are short-lived; the reservation only covers the install + commit window.

Frozen-lockfile CI failures are expected during the gap between a manifest wave and its reconcile commit; clear them promptly with the reconcile task. While `bun.lock` is reserved for reconcile, agents must not edit or commit any workspace `package.json` until that reservation is released.

Worktrees make local installs safer, but `bun.lock` is still a single shared
derived artifact. Do not stage it outside the reconcile task.

Phase 0's `bw-f4p.24` is the canonical example.

---

## Barrel Export Discipline

Barrel files are shared write surfaces governed by RULE 2. Worktrees do not
remove this policy: barrels are public API chokepoints, and parallel export
edits still need ordering, review, and merge coordination. Implementation tasks
should normally avoid editing public barrels directly.

Rules:

1. **A task is complete without its barrel export, unless the task's exit criteria explicitly require the export.** By default, implementation tasks MAY close with their new symbols unexported from the package's public `index.ts`. The feature, fixtures, and tests landing in their own files is sufficient for `br close`. If a task's acceptance criteria explicitly name the barrel export as a deliverable, follow that.
2. **Inline barrel edits are allowed only with a seconds-long reservation.** If a task chooses to add its own export, the reservation on the barrel must cover the full `reserve -> re-read -> edit -> commit -> release` window. Never release a barrel reservation while the barrel file remains modified in your working tree.
3. **Defer via the phase-complete task.** Each phase has a `Phase N implementation complete` rollup task (Phase 1 = `bw-b63.15`, Phase 2 = `bw-1dl.13`, Phase 3 = `bw-2yn.7`, Phase 4 = `bw-zxk.11`). Before closing implementation work that deferred its export, append a one-line entry to that rollup task under a `### Pending barrel exports` section:

   ```
   - bw-b63.1 → export `decodeIdentifier`, `MacaroonIdentifierV0` from `packages/l402/src/index.ts`
   - bw-b63.8 → export `parseCaveat`, `serializeCaveat`, `servicesCaveat`, `capabilitiesCaveat`, `constraintCaveat`, `Caveat` from `packages/l402/src/index.ts`; `caveats` fixture set from `packages/test-fixtures/src/index.ts`
   ```

   If the section doesn't exist yet, the first task to defer creates it (`br update <phase-task> --description-append "..."` or hand-edit + `br sync`).

4. **The phase-complete task batches the reconcile.** Its acceptance work includes a single commit that adds every queued export, runs root `bun run lint`/`typecheck`/`test`/`build`, and clears the section. That commit briefly holds an exclusive reservation on the affected barrels; no other task should be editing them concurrently.
5. **Do not stall on a held barrel reservation.** If a peer is holding a long-lived reservation on a barrel (against rule 2), defer per rule 3 rather than waiting. Track recurring violations as separate work.

---

## Project Architecture And Routing

Hard triggers stay in this file. Longer reference material lives in focused docs:

| If your task touches...                                                                              | Read...                                                                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| package boundaries, package roles, feature placement, or non-goals                                   | `docs/architecture.md`                                                                           |
| workspace packages, shared configs, `workspace:*`, `turbo.json`, or adding packages                  | `docs/monorepo-conventions.md`                                                                   |
| test design, validation commands, browser import checks, or e2e coverage                             | `docs/testing.md`                                                                                |
| public exports, JSDoc, generated docs, or compatibility notes                                        | `docs/api-docs.md`                                                                               |
| external dependency additions or shared utility placement                                            | `docs/dependency-policy.md`                                                                      |
| secrets, bearer credentials, TLS, invoice verification, constant-time comparison, or unknown caveats | `docs/security-boundaries.md`                                                                    |
| playground UI, visual direction, or demo flow ergonomics                                             | `docs/playground-visual-concepts.md` and `docs/testing.md`                                       |
| L402 wire/header/caveat/macaroon/token behavior                                                      | live L402 specs first; `.agents/skills/l402-protocol-work/SKILL.md` for workflow                 |
| startup, reservations, handoff, close, commit, push, release sequence, or task worktrees             | `.agents/skills/boltwall-workflow/SKILL.md`; `docs/agent-worktrees.md` for generic Git mechanics |
| `.github/workflows/`, GH Actions versions, workflow permissions, or CI install flags                 | `docs/github-actions-hygiene.md`                                                                 |

Mandatory summaries:

- `@boltwall/l402` owns protocol behavior; downstream packages do not reimplement wire parsing or verification.
- `@boltwall/test-fixtures` is the single source of truth for L402 wire vectors.
- Packages live exactly one directory deep under `apps/` or `packages/`.
- Internal workspace dependencies use `workspace:*`.
- Shared lint, TypeScript, and Prettier config must be consumed from the shared config packages.
- Add features to the smallest package that can own them.
- No CJS builds, old-browser support, hosted SaaS proxy, or edge middleware/proxy runtime in v1.

---

## Tooling Cheatsheet

```sh
bun install                              # install
bun run lint                             # lint all packages
bun run typecheck                        # typecheck all packages
bun run test                             # unit tests, all packages
bun run test --filter @boltwall/l402     # unit tests, single package
bun run test:browser                     # Playwright Chromium import test for @boltwall/l402
bun run test:e2e                         # Playwright e2e for playground
bun run build                            # tsup builds, all packages
bun run package-health                   # publint + arethetypeswrong
bun run docs:api                         # generate TypeDoc API reference (validates public JSDoc)
bun run size                             # size-limit budget on @boltwall/l402
bunx changeset                           # create a changeset
```

Package-specific commands (LND regtest, aperture interop, Vercel deploy) are documented in the relevant package's README.

---

## Validation Contract — Read Before Any Work

**Before picking up any task, read and confirm understanding of the validation contract for that work.** Work started without a complete, understood validation contract is work that cannot be reviewed or trusted.

The contract is the union of:

1. **The relevant exit criteria** for the task at hand.
2. **Testing expectations** (see `docs/testing.md`).
3. **Security boundaries** (see `docs/security-boundaries.md`).
4. **Code quality bar** (typing, `Uint8Array`, `bigint` msat, dependency policy, capability flag accuracy).
5. **Relevant architectural docs** in `docs/` if they exist for the area being changed.
6. **Spec sections** that govern the change. For any wire-format, status code, caveat, or identifier work, locate and cite the relevant L402 spec sections.

Rules:

- Do not start implementation until all six are complete and understood.
- If any item is incomplete or ambiguous, raise it as a blocker — do not improvise. Either draft the missing piece for owner review, or document the ambiguity and ask.
- Demonstrate the contract was met when the change is recorded.
- Re-read the contract for each new task. Stale assumptions about what "done" means are how spec violations slip in.

This rule supersedes velocity. An agent that pauses to flag an incomplete gate has done the right thing.

---

## Anti-Sycophancy

**Never capitulate to a question as if it were a directive.**

If the owner asks "why X?", "should we do Y?", or "is this right?", treat it as a request for _justification or tradeoff analysis_, not an instruction to reverse course. Before changing a recommendation: (1) state the reason for the original choice, (2) name the real tradeoff, (3) ask whether the owner wants to override the call or just understand it.

If the original choice is genuinely wrong, say so plainly with the corrected reasoning — but do not preemptively reverse based on tone alone. Sycophantic agreement leads to under-informed decisions and is forbidden.

---

## Code Editing Discipline

- Do **not** run invented one-off scripts or broad text rewrites that bulk-modify code.
- Narrow structural rewrites with `ast-grep` are allowed when the match pattern is precise, the write scope is small, and the diff is reviewed file-by-file before continuing.
- Large mechanical changes: break into smaller, explicit edits and review diffs file-by-file.
- Subtle/complex changes: edit by hand, file-by-file, with careful reasoning.
- Prefer fewer, smaller, reviewable diffs over one large patch.
- **Stay in scope.** If your task discovers a needed fix outside its scope (shared configs, lockfile reconcile, unrelated bug), track it as separate focused work and reference it from your change record. Do not expand the current task's surface to include drive-by fixes.

---

## Backwards Compatibility & File Sprawl

We optimize for clean architecture.

- No "compat shims" or "v2" file clones.
- When changing behavior, migrate callers and remove old code in the same change.
- If a change makes files or code paths redundant, ask the owner for approval
  to remove them in the same work pass instead of leaving deprecated wrappers,
  aliases, or dead files for later cleanup. The deletion rule above still
  governs: get exact command approval before deleting anything.
- New files only for genuinely new domains. The bar for adding files is high.
- Legacy `lsat-js` compatibility is a gate when the old public API remains semantically valid under current L402 behavior and is not blocked by spec drift, LSAT-only naming, browser/runtime constraints, or security rationale.
- When preserving compatibility, prefer L402-native names plus source-compatible aliases or methods where that keeps migration practical. For example, `L402.fromToken(...)` and `L402#toToken(...)` preserve the useful shape of legacy `Lsat.fromToken(...)` / `Lsat#toToken()`.
- Compatibility work starts from a complete inventory of the MIT `lsat-js` public API, not a remembered subset. Audit package entrypoints, exported types, README/API docs, and generated docs before deciding what to preserve.
- When compatibility is not preserved, document the reason and replacement in `docs/migration-from-lsat-js.md`.
- Breaking changes follow Changesets versioning conventions where Changesets is enforced; before v0.1.0 they still need an explicit compatibility/migration note when they affect legacy users.

---

## Dependency Policy

Prefer `@boltwall/internal` over external dependencies when the functionality fits
in roughly 200 lines with good unit tests. Every external dependency addition
must justify why a small internal utility is not the better fit.

Package provenance and attestations are integrity signals, not safety approval;
dependency review still follows `docs/dependency-policy.md`.

Read `docs/dependency-policy.md` before adding dependencies or shared utilities.

---

## Code Quality Bar

- All public APIs need TypeScript types — no `any` exports.
- Public exports intended for package consumers need JSDoc comments suitable for generated API documentation. Document what the symbol does, important parameters, return values, thrown errors, security-sensitive behavior, and spec references where relevant.
- Public API in `@boltwall/l402` uses `Uint8Array` and `string`, not `Buffer`. `Buffer` is forbidden in any code that ships to the browser bundle.
- All wire-format code carries a spec citation as a code comment (one of the rare cases comments are warranted).
- New caveat helpers ship with positive AND negative test vectors, including attenuation chains where applicable.
- New backend adapters ship with capability flags accurate to the implementation.
- Lightning amounts use `bigint` millisatoshis throughout. `number` sats is a bug.

Read `docs/api-docs.md` before adding or changing public exports.

---

## Security Boundaries

- **No credentials, API keys, root keys, production macaroons, or `.env` files committed — ever.**
- **Bearer-credential handling.** Macaroons and preimages must not be logged at info level.
- **Constant-time comparison required** on verification paths for signature and payment-hash equality.
- **TLS required** for documented deployment paths. Examples that omit TLS must say so clearly.
- **Invoice amount verification.** Middleware MUST verify the bolt11 amount matches the configured price.
- **Unknown-caveat security model.** Unknown caveats are skipped when no satisfier matches. Never rely on unknown caveats failing closed.

Read `docs/security-boundaries.md` when touching security-sensitive behavior.

---

## AGPL Isolation

Legacy `bucko13/boltwall` is AGPL-3.0 and is **reference only**. Read prose, README, architecture diagrams. Do **not** copy source code, code comments, tests, or generated docs into this repository.

Anything ported is **re-implemented from the L402 spec** or from the MIT-licensed `lsat-js` where overlap exists. Changes that touch ported logic carry an explicit "re-implemented from spec, not copied from AGPL source" note in the change record.

`Tierion/lsat-js` is MIT and may be referenced or carefully ported with attribution where genuinely useful. Even MIT references should be documented in the change record.

---

## Spec References and Primary Sources

Always follow links rather than relying on memory.

- L402 protocol spec: <https://raw.githubusercontent.com/lightninglabs/L402/master/protocol-specification.md>
- L402 macaroon spec: <https://raw.githubusercontent.com/lightninglabs/L402/master/macaroon-spec.md>
- L402 agent spec: <https://raw.githubusercontent.com/lightninglabs/L402/master/agent-spec.md>
- Lightning Labs Aperture (Go reference): <https://github.com/lightninglabs/aperture>
- WebLN spec: <https://www.webln.dev/>
- WebLN `sendPayment`: <https://www.webln.dev/client/send-payment>
- BOLT 11: <https://github.com/lightning/bolts/blob/master/11-payment-encoding.md>
- Legacy `Tierion/lsat-js` (MIT): <https://github.com/Tierion/lsat-js>
- Legacy `bucko13/boltwall` (AGPL — reference only): <https://github.com/bucko13/boltwall>
- Legacy `bucko13/now-boltwall`: <https://github.com/bucko13/now-boltwall>
- Legacy `bucko13/lsat-playground`: <https://github.com/bucko13/lsat-playground>

---

## Testing

Write tests that prove behavior. Use focused unit tests for local logic,
integration tests for package boundaries, and e2e tests for user-visible flows.

**`docs/testing.md` is the authoritative reference for every test surface in
this repo.** Read it before picking up any work that touches tests. Any bead
that adds a new test type, `test:*` script, runner, or infrastructure
dependency MUST update `docs/testing.md` as part of its acceptance criteria —
missing this update means the bead is not complete.

Test surfaces at a glance:

| Script                                        | Surface                                  | Infra required       |
| --------------------------------------------- | ---------------------------------------- | -------------------- |
| `bun run test`                                | Unit tests, all packages                 | None                 |
| `bun run test:browser`                        | l402 ESM bundle in Chromium (Playwright) | Built l402 bundle    |
| `bun run test:e2e` (from `apps/playground`)   | Playground UI flows (Playwright)         | Node.js only         |
| `bun run test:interop` (from `packages/l402`) | Aperture live protocol interop           | Docker + LND regtest |

Do not add infrastructure-dependent tests to the default `bun run test` glob.
Keep each surface behind its own `test:<surface>` script so normal test runs
stay clean and the infrastructure requirement is explicit.

---

## Agent Coordination And Task Workflow

Use `.agents/skills/boltwall-workflow/SKILL.md` for the full local runbook. This
section is the mandatory minimum.

Agent Mail is the coordination channel for agent identity, inboxes, threaded
updates, file reservations, and handoffs. The local task graph is managed with
`br` and `bv`.

Mandatory workflow:

1. **Session start in the canonical checkout:** `ensure_project` ->
   `register_agent` -> `fetch_inbox`. Use the shared canonical Agent Mail
   project key; do not derive a new project key from a task worktree path.
2. **Triage:** `bv --robot-triage` or another `bv --robot-*` command. Never run
   bare interactive `bv` in automation.
3. **Claim:** `br update <id> --claim --actor <agent>`. Do not use
   `--status=in_progress` alone.
4. **Reserve:** call `file_reservation_paths` for the narrowest exact paths
   before editing.
5. **Announce:** send a start note with `thread_id="<task-id>"`, claimed task,
   reserved paths, intended scope, validation plan, task worktree path, and
   branch name.
6. **Create a task worktree:** follow `.agents/skills/boltwall-workflow/SKILL.md`
   for agent-specific sequencing and `docs/agent-worktrees.md` for Git mechanics.
   Keep Beads and Agent Mail in the canonical checkout; implement and validate
   in the task worktree.
7. **Work:** re-read reserved files in the task worktree, stay in scope, check
   inbox on meaningful pauses, renew reservations when needed, and do not edit
   conflicting paths.
8. **Handoff:** if unfinished, post status, changed/reserved files, validation
   done, validation still needed, risks/conflicts, and exact next step before
   releasing reservations.
9. **Update in-progress task state:** if the work is not ready to land, update
   task status and post a handoff. Do not close finished work before commit and
   push.
10. **Land code:** use the task worktree landing sequence in
    `.agents/skills/boltwall-workflow/SKILL.md`.
11. **Close finished task:** after the remote push or PR landing succeeds,
    close completed work or update any remaining in-progress task state.
12. **Release and complete:** release reservations only when no reserved file
    remains locally modified, then send completion mail with summary,
    validation, commit hash, and released paths.

If an environment cannot create task worktrees, stop and ask the owner for a
fallback before editing in the canonical checkout.

If Agent Mail tools are unavailable, preserve the outcomes: stable actor
identity, explicit reservation-equivalent notes, no overlapping edits, clear
handoffs, and documented fallback. Missing tool parity is not permission to skip
coordination.

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

## Search And Refactor Tools

- Use `rg` for fast text search.
- Use `ast-grep` when structure matters or when applying codemods.
- Use Warp Grep only for broad "how does this work?" discovery when available.
- Avoid ad hoc text rewrites for subtle code changes; keep diffs small and
  review file-by-file.

---

## Landing the Plane (Session Completion)

**When ending a work session, work is NOT complete until the commit is visible
on the required remote branch or the PR-gated workflow has landed it.**

### Mandatory workflow

1. **File issues for remaining work** — create tracked tasks (`br create ...`) for anything that needs follow-up.
2. **Verify the validation contract was met.** If any gate is missing, do not push — fix or escalate.
3. **Run quality gates locally** if code changed:
   ```sh
   bun run lint
   bun run typecheck
   bun run test
   bun run build
   ```
4. **Update in-progress task status** — if work is not ready to land, record the
   current state and handoff. Do not close finished work before commit and push.
5. **Land remotely.** Follow `.agents/skills/boltwall-workflow/SKILL.md`: sync
   Beads from the canonical checkout, rebase the task worktree, stage reviewed
   paths, commit, and use the active integration mode. This repository is in
   direct-integration mode until the owner flips it to PR-gated mode for
   production; direct-integration work pushes the validated commit to `main`.
6. **Close completed task status** — only after the remote push or PR landing
   succeeds. If work remains, leave it open with a current handoff note.
7. **Release file reservations (Mail).**
   - `release_file_reservations(project_key="<canonical-project-key>", agent_name=<you>, paths=[...])`
8. **Final Mail reply** in the task thread with summary and commit hash.
9. **Hand off** if work remains: short note describing remaining work and outstanding blockers.

### Critical rules

- Work is NOT complete while it exists only in a local task worktree.
- Never say "ready to push when you are" — push or open the required PR.
- If push or PR validation fails, investigate the root cause. Do not force-push,
  do not `--no-verify`, do not amend an already-pushed commit. Fix the
  underlying issue and create a new commit.

---

## Note for non-Claude Agents

If your runtime does not expose exactly the same MCP helper set as Claude Code, follow the same policy outcomes using equivalent tools:

- Use the repository's shared canonical Agent Mail project key, not a task
  worktree path.
- Keep a stable agent identity for a session and include your agent name in `br --actor`.
- Treat file reservations and task status as authoritative coordination state.
- Use `bv --robot-*` outputs for triage and avoid interactive modes that block automation.
- Preserve this file's invariants (spec-first protocol behavior, no destructive actions without explicit owner approval, and mandatory push at session end).

Behavioral compliance matters more than tool-brand parity; if a specific helper is unavailable, document the fallback used in the task thread.

---

## Escalation

When stuck, escalate before improvising:

- **Spec ambiguity** → document the ambiguity in a comment on the relevant architectural doc (or open the doc if it doesn't exist) and raise it with the owner. Create a tracked task so the question is not lost.
- **Macaroon library limitation** → use the documented escape hatch (vendored fork at `packages/macaroon/`, `Uint8Array` all the way down).
- **Real-endpoint test failure** → investigate; do NOT skip the nightly compat workflow.
- **Anything destructive** (force push, branch delete, file deletion, npm operations) → ask the owner first, every time.
- **Validation-contract gap** → raise it as a blocker; do not proceed.
- **`FILE_RESERVATION_CONFLICT` from Mail** → coordinate with the holding agent in-thread; do not break their reservation.

---

## Contribution Policy

This is a private project for now. Do not add CONTRIBUTING.md, contributor lists, or "how to contribute" sections to README. If the policy changes, the owner will update this section.
