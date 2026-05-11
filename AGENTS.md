# AGENTS.md — Boltwall Suite

This file is the operational contract for AI agents working in this repository. Read it end-to-end before making any change. It supersedes general agent-coding habits where the two conflict. If anything is unclear, ambiguous, or appears wrong, **stop and ask the owner**. Do not improvise.

---

## SESSION START — RUN BEFORE TOUCHING ANY BEAD

The very first actions in any new session, in this exact order, before triage or claim:

1. `mcp__mcp-agent-mail__ensure_project` (`project_root=<absolute path to this repository>`).
2. `mcp__mcp-agent-mail__register_agent` (same `project_key`, stable `agent_name`).
3. `mcp__mcp-agent-mail__fetch_inbox` — handle anything addressed to you first.
4. THEN `bv --robot-triage` to pick a bead.
5. Claim atomically with `br update <id> --claim` (sets `status=in_progress` AND `assignee` together — `--status=in_progress` alone leaves you anonymous).
6. Reserve files via `file_reservation_paths` BEFORE editing. Follow RULE 2 for reservation lifecycle, shared write surfaces, and handoffs.
7. Announce in-thread via `send_message(thread_id="<bead-id>")` so peers can see what you're doing.

Skipping any of steps 1–3 leaves you invisible to peer agents and breaks reservation safety. Skipping step 5's `--claim` flag (using `--status=in_progress` alone) leaves the assignee field null and creates the same coordination failure even if you registered. The full canonical workflow is documented in `Beads Workflow Integration → Workflow Pattern (canonical — every step is mandatory)` later in this file.

If peer agents may have edited the tree since you last looked: run `git status` and `git log --oneline -10`, and re-read any file you plan to modify. Don't assume your mental model is current.

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

---

## RULE 2 – PARALLEL WORK & HANDOFF SAFETY

This repository can be worked on by multiple agents at once. Coordination rules are correctness rules, not etiquette.

### Reservation lifecycle

Before editing any file, reserve it through Agent Mail. A reservation protects the full edit lifecycle:

1. reserve the exact path(s)
2. re-read the current file contents
3. edit
4. validate the change as required by the bead
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

For shared write surfaces, prefer deferring the change to the phase-complete/reconcile bead. If immediate editing is required, the reservation must cover the entire short critical section:

`reserve -> re-read -> edit -> commit -> release`

A "short reservation" is invalid if the file remains modified locally after release.

### Hand-offs

If you stop, pause, hit a blocker, or leave work unfinished, post a handoff note on the bead thread before releasing any reservation. The handoff must include:

- current status
- files changed or reserved
- validation already run
- validation still needed
- known risks or conflicts
- exact next step

Do not close a bead with uncommitted changes. Do not leave a bead `in_progress` without a current Agent Mail thread update explaining ownership and next action.

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

A designated reconcile bead (label `lockfile-reconcile`) is the only thing that commits `bun.lock`. It reserves `bun.lock` briefly, runs one clean `bun install` after a wave of manifest changes has landed, validates that root `bun run typecheck`/`lint`/`build`/`test` all exit 0, and commits the resulting lockfile. Reconcile beads are short-lived; the reservation only covers the install + commit window.

Phase 0's `bw-f4p.24` is the canonical example.

---

## Barrel Export Discipline

Barrel files are shared write surfaces governed by RULE 2. Implementation beads should normally avoid editing public barrels directly.

Rules:

1. **A bead is complete without its barrel export, unless the bead's exit criteria explicitly require the export.** By default, implementation beads MAY close with their new symbols unexported from the package's public `index.ts`. The feature, fixtures, and tests landing in their own files is sufficient for `br close`. If a bead's "Acceptance criteria" or "What" section explicitly names the barrel export as a deliverable, follow that — the bead-level instruction wins.
2. **Inline barrel edits are allowed only with a seconds-long reservation.** If a bead chooses to add its own export, the reservation on the barrel must cover the full `reserve -> re-read -> edit -> commit -> release` window. Never release a barrel reservation while the barrel file remains modified in your working tree.
3. **Defer via the phase-complete bead.** Each phase has a `Phase N implementation complete` rollup bead (Phase 1 = `bw-b63.15`, Phase 2 = `bw-1dl.13`, Phase 3 = `bw-2yn.7`, Phase 4 = `bw-zxk.11`). Before closing an implementation bead that deferred its export, append a one-line entry to that rollup bead under a `### Pending barrel exports` section:

   ```
   - bw-b63.1 → export `decodeIdentifier`, `MacaroonIdentifierV0` from `packages/l402/src/index.ts`
   - bw-b63.8 → export `parseCaveat`, `serializeCaveat`, `servicesCaveat`, `capabilitiesCaveat`, `constraintCaveat`, `Caveat` from `packages/l402/src/index.ts`; `caveats` fixture set from `packages/test-fixtures/src/index.ts`
   ```

   If the section doesn't exist yet, the first bead to defer creates it (`br update <phase-bead> --description-append "..."` or hand-edit + `br sync`).
4. **The phase-complete bead batches the reconcile.** Its acceptance work includes a single commit that adds every queued export, runs root `bun run lint`/`typecheck`/`test`/`build`, and clears the section. That commit briefly holds an exclusive reservation on the affected barrels; no other bead should be editing them concurrently.
5. **Do not stall on a held barrel reservation.** If a peer is holding a long-lived reservation on a barrel (against rule 2), defer per rule 3 rather than waiting. File a bead noting the violation if it recurs.

---

## Project Architecture And Routing

Hard triggers stay in this file. Longer reference material lives in focused docs:

| If your task touches... | Read... |
|---|---|
| package boundaries, package roles, feature placement, or non-goals | `docs/architecture.md` |
| workspace packages, shared configs, `workspace:*`, `turbo.json`, or adding packages | `docs/monorepo-conventions.md` |
| test design, validation commands, browser import checks, or e2e coverage | `docs/testing.md` |
| public exports, JSDoc, generated docs, or compatibility notes | `docs/api-docs.md` |
| external dependency additions or shared utility placement | `docs/dependency-policy.md` |
| secrets, bearer credentials, TLS, invoice verification, constant-time comparison, or unknown caveats | `docs/security-boundaries.md` |
| L402 wire/header/caveat/macaroon/token behavior | live L402 specs first; `.agents/skills/l402-protocol-work/SKILL.md` for workflow |
| startup, reservations, handoff, close, commit, push, or release sequence | `.agents/skills/boltwall-workflow/SKILL.md` |

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

If the owner asks "why X?", "should we do Y?", or "is this right?", treat it as a request for *justification or tradeoff analysis*, not an instruction to reverse course. Before changing a recommendation: (1) state the reason for the original choice, (2) name the real tradeoff, (3) ask whether the owner wants to override the call or just understand it.

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
The `test:browser` Playwright Chromium import test is required for cross-runtime
changes in `@boltwall/l402`.

Read `docs/testing.md` for the validation matrix and good test-shape guidance.

---

## MCP Agent Mail — Multi-Agent Coordination

Agent Mail is available as an MCP server for coordinating work across agents. **This is the primary mechanism for multi-agent work delegation in this repo.**

> **Mandatory at session start:** call `ensure_project` + `register_agent` + `fetch_inbox` BEFORE running `bv --robot-triage` or `br update --claim`. See `Beads Workflow Integration → Step 0 — Session start` for the exact sequence. Agents that skip this are invisible to peers and break file-reservation safety.

What Agent Mail provides:

- Identities, inbox/outbox, searchable threads.
- Advisory file reservations (leases) so agents don't clobber each other.
- Persistent artifacts in git (human-auditable).

Project coordination identity:

- Local tool calls use `project_key=<repo-root>` where `<repo-root>` is the absolute path to this checkout on the current machine.
- Resource reads may use the Agent Mail project slug returned by `ensure_project` when a URI cannot represent a raw absolute path cleanly. Do not commit a machine-specific slug.
- Use stable agent names returned by `register_agent`; do not invent role names for message recipients.

Claim-before-edit recipe:

1. Claim the bead with `br update <id> --claim --actor <agent-name>`.
2. Reserve the narrowest edit surface with `file_reservation_paths(..., paths=[...], ttl_seconds=3600, exclusive=true, reason="<id>")`.
3. Announce the start in the bead thread with `send_message(thread_id="<id>", subject="[<id>] Start: ...", ack_required=true)`.
4. Release the same reservations only after the bead is closed or handed off under RULE 2. Never release while reserved files remain locally modified.

### Tools reference

The procedure for using these tools is in `Beads Workflow Integration → Workflow Pattern (canonical — every step is mandatory)` below. This subsection only describes what each tool does.

`project_key` is the absolute path to this repository on the current machine. Do not commit personal home-directory paths; write `<repo-root>` in examples and substitute the real path only in local tool calls.

| Tool | Purpose |
|---|---|
| `ensure_project` | Idempotent project registration. Safe to call every session. |
| `register_agent` | Register a stable `agent_name` so peers see who's online. |
| `file_reservation_paths` | Lease an edit surface; pass `paths`, `ttl_seconds`, `exclusive`, `reason="<bead-id>"`. Use the narrowest pattern that covers your edits. |
| `send_message` / `fetch_inbox` / `acknowledge_message` | In-thread coordination keyed by `thread_id="<bead-id>"`. |
| `resource://inbox/{Agent}` / `resource://thread/{id}` | Token-cheap reads via MCP resources. |
| `release_file_reservations` | Drop your leases on bead close. |

**Macros** combine common sequences: `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`. Prefer macros when speed matters more than fine-grained control.

**Common pitfalls.** `from_agent not registered` → call `register_agent` with the correct absolute `project_key`. `FILE_RESERVATION_CONFLICT` → narrow your patterns, wait for expiry, or use a non-exclusive reservation.

**Mail vs Beads.** Mail = agent-to-agent coordination (messaging, file reservations, hand-offs). Beads/bv = "what to work on" (triage, priority, dependencies). Don't track issue state in Mail; don't message peers via Beads.

<!-- bv-agent-instructions-v2 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` **on the local machine only** — `.beads/` is gitignored and is not part of the OSS-distributed repo. All co-operating agents must share the same local checkout to see each other's bead state.

`br sync --flush-only` exports the SQLite DB to `.beads/issues.jsonl` as a human-readable canonical view. It is a local-only operation; there is nothing to commit afterward.

### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). `br` handles creating, modifying, and closing beads.

**CRITICAL: Use ONLY --robot-* flags. Bare bv launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
```

#### Other bv Commands

| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with unblocks lists |
| `--robot-priority` | Priority misalignment detection with confidence |
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS, eigenvector, critical path, cycles, k-core |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
```

### br Commands for Issue Management

```bash
br ready              # Show issues ready to work (no blockers)
br list --status=open # All open issues
br show <id>          # Full issue details with dependencies
br create --title="..." --type=task --priority=2
br update <id> --claim                # atomic: status=in_progress AND assignee=<your name>
br close <id> --reason="Completed"
br close <id1> <id2>  # Close multiple issues at once
br sync --flush-only  # Export DB to JSONL
```

### Workflow Pattern (canonical — every step is mandatory)

The single workflow contract. Step 0 is also summarized in `SESSION START` at the top of this file; both should be read.

0. **Session start.** `ensure_project` + `register_agent` + `fetch_inbox`, in that order, before triage. Skipping makes you invisible to peers.
1. **Triage.** `bv --robot-triage` → pick a bead from `recommendations`. Skip beads labeled `requires-owner` unless your work is to prepare artifacts for owner review.
2. **Claim atomically.** `br update <id> --claim` (sets `status=in_progress` AND `assignee` in one call). `--status=in_progress` alone leaves `assignee` null and peers can't see who owns the work.
3. **Reserve edit surface.** `file_reservation_paths(project_key="<repo-root>", agent_name=<you>, paths=[...narrowest pattern...], ttl_seconds=3600, exclusive=true, reason="<bead-id>")`. Reserve before editing — not after. Follow RULE 2 for the full lifecycle.
4. **Announce start.** `send_message(thread_id="<bead-id>", subject="[<bead-id>] Start: <short title>", ack_required=true)`. One thread per bead id, persistent for the bead's lifetime.
5. **Work.** Implement the task. Reply in-thread on meaningful progress and at handoff points. Handoffs must include the RULE 2 checklist.
6. **Complete.** `br close <id> --reason "Completed: <one-line summary>"`. Close the bead BEFORE releasing reservations — Beads is the status authority.
7. **Release reservations.** `release_file_reservations(project_key="<repo-root>", agent_name=<you>, paths=[...same patterns...])`. Release only when RULE 2 allows it. Final mail reply: `[<bead-id>] Completed` with summary + commit hash.
8. **Sync + push.** `br sync --flush-only` to refresh the local `.beads/issues.jsonl` canonical view, then `git add` / `git commit` / `git push` of code changes per `Landing the Plane` below. Bead state itself is local-only and is not pushed; code work is NOT done until `git push` of the code changes succeeds.

**Bead-id conventions.** Mail `thread_id` = `br-###`. Mail subject prefix = `[br-###]`. File reservation `reason` = `br-###`. Commit messages: include `br-###` for traceability.

### Key Concepts

- **Dependencies**: Issues can block other issues. `br ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers 0-4, not words)
- **Types**: task, bug, feature, epic, chore, docs, question
- **Blocking**: `br dep add <issue> <depends-on>` to add dependencies
- **Complexity estimates**: use labels, not time estimates. Apply exactly one of `complexity:s`, `complexity:m`, `complexity:l`, or `complexity:xl` to implementation beads. These mean relative execution complexity and coordination risk, not wall-clock duration.
- **Work graph**: Beads tracks executable work, status, priority, dependencies, and ownership. Durable project memory belongs in AGENTS.md, README.md, and `docs/`, not permanent pinned/reference beads.
- **Owner gates**: `requires-owner` means the bead needs explicit owner action or approval. Agents may prepare artifacts for these beads, but must not close them unless the acceptance criteria say agent verification is enough.
- **Epics**: epics are phase/integration contracts. Treat their `## Success Criteria` as the phase contract, coordinate the child beads, and use `br epic status --json` and `br epic close-eligible` to decide when an epic can close.

### Complexity Labels

Use complexity labels consistently:

- `complexity:s`: small, local change with low coupling and straightforward validation.
- `complexity:m`: moderate implementation touching a few files or one package boundary; needs focused tests.
- `complexity:l`: broad feature or cross-package work with meaningful integration risk.
- `complexity:xl`: security-critical, architecture-defining, or multi-phase work that should be decomposed before implementation.

Do not use time estimates for planning. If a bead is too large to classify clearly, split it or mark it `complexity:xl` and create smaller child beads.

### Session Protocol

See `Landing the Plane` below for the canonical session-completion sequence (sync, push, release reservations, final mail reply).

<!-- end-bv-agent-instructions -->

---

## ast-grep vs ripgrep

**Use `ast-grep` when structure matters.** It parses code and matches AST nodes, so results ignore comments/strings, understand syntax, and can **safely rewrite** code.

- Refactors/codemods: rename APIs, change import forms, rewrite call sites or variable kinds.
- Policy checks: enforce patterns across the repo (`scan` with rules + `test`).
- Editor/automation: LSP mode; `--json` output for tooling.

**Use `ripgrep` when text is enough.** Fastest way to grep literals/regex across files.

- Recon: find strings, TODOs, log lines, config values, non-code assets.
- Pre-filter: narrow candidate files before a precise pass.

**Rule of thumb:**

- Need correctness over speed, or you'll **apply changes** → start with `ast-grep`.
- Need raw speed or you're just **hunting text** → start with `rg`.
- Often combine: `rg` to shortlist files, then `ast-grep` to match/modify with precision.

**Snippets:**

```sh
# find structured code (ignores comments/strings)
ast-grep run -l TypeScript -p 'import $X from "$P"'

# codemod (only real `var` declarations become `let`)
ast-grep run -l TypeScript -p 'var $A = $B' -r 'let $A = $B' -U

# quick textual hunt
rg -n 'console\.log\(' -t ts

# combine speed + precision
rg -l -t ts '@boltwall/' | xargs ast-grep run -l TypeScript -p 'import { $X } from "@boltwall/$P"' --json
```

**Mental model:**

- Unit of match: `ast-grep` = node; `rg` = line.
- False positives: `ast-grep` low; `rg` depends on regex.
- Rewrites: `ast-grep` first-class; `rg` requires ad-hoc sed/awk and risks collateral edits.

---

## Morph Warp Grep — AI-Powered Code Search

Use `mcp__morph-mcp__warp_grep` for "how does X work?" discovery across the codebase.

**When to use:**

- You don't know where something lives.
- You want data flow across multiple files (e.g., header parse → middleware → adapter → invoice → response).
- You want all touchpoints of a cross-cutting concern (e.g., caveat verification, capability flag handling).

```
mcp__morph-mcp__warp_grep(
  repoPath: "<repo-root>",
  query: "How does dual-scheme challenge emission work end-to-end?"
)
```

Warp Grep:

- Expands a natural-language query into multiple search patterns.
- Runs targeted greps, reads code, follows imports, returns concise snippets with line numbers.
- Reduces token usage by returning only relevant slices, not entire files.

**When not to use Warp Grep:**

- You already know the function/identifier name → use `rg`.
- You know the exact file → just open it.
- You only need a yes/no existence check.

| Scenario | Tool |
|---|---|
| "How does dual-scheme challenge emission work?" | `warp_grep` |
| "Where is `parseAuthenticateHeader` defined?" | `rg` |
| "Replace `var` with `let`" | `ast-grep` |

---

## Common Workflows

Use these compact workflows to avoid coordination drift:

### Pick up and execute a bead

```sh
mcp__mcp-agent-mail__ensure_project(project_root="<repo-root>")
mcp__mcp-agent-mail__register_agent(project_key="<repo-root>", name="<agent>")
mcp__mcp-agent-mail__fetch_inbox(project_key="<repo-root>", agent_name="<agent>")
bv --robot-triage
br update <id> --claim --actor <agent>
```

Then reserve files, send a start message in thread `<id>`, implement, close via `br close`, release reservations, sync beads, commit, and push.

### Run a spec-sensitive protocol change

1. Read the relevant L402 spec section before editing.
2. Add/adjust conformance fixtures in `@boltwall/test-fixtures`.
3. Add positive and negative tests for wire behavior.
4. Record exact spec section citations in commit message and code comments where required.
5. Validate with lint/typecheck/test/build plus browser import checks if `@boltwall/l402` is affected.

### Resolve reservation conflicts

1. Do not edit conflicting paths.
2. Notify holder in the bead thread with intended scope.
3. Re-scope reservations to narrow patterns when possible.
4. Wait for release/expiry, then reacquire reservations and continue.

---

## Landing the Plane (Session Completion)

**When ending a work session, work is NOT complete until `git push` succeeds.**

### Mandatory workflow

1. **File issues for remaining work** — open beads (`br create ...`) for anything that needs follow-up.
2. **Verify the validation contract was met.** If any gate is missing, do not push — fix or escalate.
3. **Run quality gates locally** if code changed:
   ```sh
   bun run lint
   bun run typecheck
   bun run test
   bun run build
   ```
4. **Update bead status** — close finished work, update in-progress items.
5. **PUSH TO REMOTE.** This is mandatory:
   ```sh
   git pull --rebase
   br sync --flush-only                    # local-only canonical view; `.beads/` is gitignored
   git add <staged paths>                  # avoid `git add -A` unless verified clean
   git commit -m "<subject>"               # body covers exit criteria, tests run, spec citations, dep justification, AGPL note
   git push
   git status                              # MUST show "up to date with origin/main"
   ```
6. **Release file reservations (Mail).**
   - `release_file_reservations(project_key="<repo-root>", agent_name=<you>, paths=[...])`
7. **Final Mail reply** in the bead thread: `[br-###] Completed` with summary and commit hash.
8. **Hand off** if work remains: short note describing remaining work and outstanding blockers.

### Critical rules

- Work is NOT complete until `git push` succeeds.
- Never stop before pushing — that leaves work stranded locally and invisible.
- Never say "ready to push when you are" — you push.
- If push fails (rejected, hook failure, etc.), investigate the root cause. Do not force-push, do not `--no-verify`, do not amend an already-pushed commit. Fix the underlying issue and create a new commit.

---

## Note for non-Claude Agents

If your runtime does not expose exactly the same MCP helper set as Claude Code, follow the same policy outcomes using equivalent tools:

- Use the repository's actual absolute path as the Agent Mail `project_key`.
- Keep a stable agent identity for a session and include your agent name in Beads `--actor`.
- Treat file reservations and Beads status as authoritative coordination state.
- Use `bv --robot-*` outputs for triage and avoid interactive modes that block automation.
- Preserve this file's invariants (spec-first protocol behavior, no destructive actions without explicit owner approval, and mandatory push at session end).

Behavioral compliance matters more than tool-brand parity; if a specific helper is unavailable, document the fallback used in the bead thread.

---

## Escalation

When stuck, escalate before improvising:

- **Spec ambiguity** → document the ambiguity in a comment on the relevant architectural doc (or open the doc if it doesn't exist) and raise it with the owner. Open a bead so the question is tracked.
- **Macaroon library limitation** → use the documented escape hatch (vendored fork at `packages/macaroon/`, `Uint8Array` all the way down).
- **Real-endpoint test failure** → investigate; do NOT skip the nightly compat workflow.
- **Anything destructive** (force push, branch delete, file deletion, npm operations) → ask the owner first, every time.
- **Validation-contract gap** → raise it as a blocker; do not proceed.
- **`FILE_RESERVATION_CONFLICT` from Mail** → coordinate with the holding agent in-thread; do not break their reservation.

---

## Contribution Policy

This is a private project for now. Do not add CONTRIBUTING.md, contributor lists, or "how to contribute" sections to README. If the policy changes, the owner will update this section.
