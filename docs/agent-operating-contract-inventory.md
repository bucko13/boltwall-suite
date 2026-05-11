# Agent Operating Contract Inventory

Planning artifact for bead `bw-zgn.1`.

This document inventories the current `AGENTS.md` behavior before any compaction.
It does not remove, weaken, or reinterpret repository policy. Later beads may use
this map to route material into repo skills, global skills, or docs, but the
current operating contract remains `AGENTS.md` until explicitly changed.

## Authority Hierarchy

Target hierarchy for extracted guidance:

1. Live L402 specification and linked primary specs.
2. Repository `AGENTS.md`.
3. Repository-local skills and docs under `.agents/` and `docs/`.
4. Global skills.
5. Generic model, tool, and coding habits.

If two sources disagree, the higher source wins. For L402 protocol behavior, the
live spec wins over all local summaries.

## Existing Repo-Local Overlaps

| Existing file | Current overlap | Inventory conclusion |
|---|---|---|
| `.agents/skills/agent-startup/SKILL.md` | Startup prompt, read `AGENTS.md`/README, Agent Mail, Beads triage, file reservations. | Good target for detailed startup flow, but keep a short mandatory startup gate in `AGENTS.md`. |
| `.agents/skills/beads/SKILL.md` | Beads/BV concepts, robot-mode triage, issue updates, completion checklist. | Good target for Beads/BV operational detail. Keep claim-before-edit and non-interactive `bv --robot-*` warnings prominent in `AGENTS.md`. |
| `.agents/skills/compact-handoff/SKILL.md` | Compact handoff/resume format and context hygiene. | Good target for handoff mechanics. Keep handoff-before-release invariant in `AGENTS.md`. |
| `.agents/AGENT_MAIL.md` | Agent Mail project key, session start, reservations, Beads vs Mail boundary. | Good target for Agent Mail tool procedure. Keep mandatory registration/reservation invariants in `AGENTS.md`. |

## Section-by-Section Map

| Current `AGENTS.md` section | Target home | Rationale and notes |
|---|---|---|
| Title and opening contract | Keep in `AGENTS.md` | Defines the file as the repo's operational contract and tells agents to stop on ambiguity. Must remain first-screen policy. |
| `SESSION START - RUN BEFORE TOUCHING ANY BEAD` | Keep compact summary in `AGENTS.md`; move expanded steps to `.agents/skills/agent-startup` and `.agents/AGENT_MAIL.md` | Mandatory startup is safety-critical. The repetition with Agent Mail/Beads sections is defensive and should remain in compact form. |
| `TOP PRIORITY - L402 SPEC COMPLIANCE` | Keep in `AGENTS.md`; mirror detailed protocol workflow in a repo skill/doc only if later created | This is the central project invariant. Do not bury it in a skill. Live spec links and spec-citation requirements must stay prominent. |
| `RULE 1 - ABSOLUTE` | Keep in `AGENTS.md` | No-delete rule is a hard invariant and intentionally stronger than generic tool policy. |
| `RULE 2 - PARALLEL WORK & HANDOFF SAFETY` | Keep compact invariant in `AGENTS.md`; move operational reservation lifecycle detail to `.agents/AGENT_MAIL.md` and `compact-handoff` | Reservation lifecycle is both policy and procedure. Shared write surface warnings must remain prominent. |
| `IRREVERSIBLE GIT & FILESYSTEM ACTIONS` | Keep in `AGENTS.md` | Destructive-command approval and audit trail are hard invariants. Do not move out of the main contract. |
| `Node / JS Toolchain` | Keep compact rule in `AGENTS.md`; move full toolchain conventions to repo docs if desired | Bun-only, latest Node LTS, ESM-only, strict TS are repo-wide invariants. |
| ``bun.lock` discipline` | Keep in `AGENTS.md` | Lockfile staging prohibition and reconcile-bead ownership are coordination-critical shared-surface rules. |
| `Barrel Export Discipline` | Keep compact shared-surface policy in `AGENTS.md`; move phase-rollup examples to repo doc | Prevents multi-agent conflicts. Detailed examples can live in docs, but default "bead complete without barrel export" must stay prominent. |
| `Project Architecture` | Move most detail to README or `docs/architecture.md`; keep a short architecture index in `AGENTS.md` | Stable project layout and package responsibilities are useful reference material, not all operational policy. Keep `@boltwall/l402` foundation and fixtures source-of-truth note visible. |
| `Monorepo Conventions (Turborepo + Bun workspaces)` | Move detailed examples/checklists to repo doc; keep compact no-nested-packages, shared-config, `workspace:*`, and package-level dependency rules in `AGENTS.md` | Most content is durable architecture guidance. The non-negotiable constraints should remain in the contract. |
| `Shared configuration packages` | Move examples/table to repo doc | Detailed package config examples belong in architecture/monorepo docs. Keep "do not duplicate config" in `AGENTS.md`. |
| `Workspace dependency protocol` | Keep one-line invariant in `AGENTS.md`; move JSON example to repo doc | `workspace:*` only is policy; example can move. |
| `Cross-package code reuse` | Move table to repo doc; keep "lift duplicated shared code appropriately" in `AGENTS.md` | Structural guidance, referenced by dependency policy. |
| `Third-party dependencies - package-level, not centralized` | Keep compact policy in `AGENTS.md`; move examples to repo doc | Prevents bad dependency architecture and interacts with dependency policy. |
| `turbo.json task pipeline` | Move canonical pipeline JSON to repo doc; keep root invocation guidance in `AGENTS.md` | Pipeline JSON is reference material. Agents need only the operational summary unless editing Turbo. |
| `Adding a new package` | Move checklist to repo doc | It is a detailed workflow, not a global invariant. Keep "single level under apps/packages" in `AGENTS.md`. |
| `What does NOT live in shared packages` | Move to repo doc; keep compact "no phase workflow logic or generated outputs" rule in `AGENTS.md` | Supports architecture choices but can be referenced from docs. |
| `Mission and Non-Goals` | Move full prose to README/docs; keep compact non-goals that affect implementation in `AGENTS.md` | Mission belongs in project docs. Non-goals that prevent wasted work, such as no CJS and no Edge runtime, should remain visible. |
| `Tooling Cheatsheet` | Move to README or repo skill; keep short command pointer in `AGENTS.md` | Commands are procedural reference. |
| `Validation Contract - Read Before Any Work` | Keep in `AGENTS.md` | Gate-before-implementation is an operating invariant. |
| `Anti-Sycophancy` | Keep in `AGENTS.md` or global skill; prefer keep compact in `AGENTS.md` | It controls owner interaction in this repo and prevents unsafe reversals. |
| `Code Editing Discipline` | Keep in `AGENTS.md` | Scope control and safe editing are operational policy. |
| `Backwards Compatibility & File Sprawl` | Keep compact policy in `AGENTS.md`; move LSAT inventory details to migration doc | Impacts implementation decisions. Detailed legacy API inventory belongs in migration docs. |
| `Dependency Policy` | Keep in `AGENTS.md` | External dependency gate is policy. The examples can remain or move to repo doc, but the 200-line heuristic and change-record justification must stay. |
| `Code Quality Bar` | Keep in `AGENTS.md` | Public API, `Uint8Array`, spec comments, caveat/adapters, and `bigint` msat rules are implementation invariants. |
| `Generated API Docs` | Keep compact requirement in `AGENTS.md`; move style detail to docs/API guidance | Public JSDoc and generated-doc cleanliness are important, but detailed prose can route to API docs. |
| `Security Boundaries` | Keep in `AGENTS.md` | Secrets, credential logging, constant-time comparison, TLS, invoice amount checks, and unknown-caveat behavior are hard invariants. |
| `AGPL Isolation` | Keep in `AGENTS.md` | License contamination prevention is a hard invariant. |
| `Spec References and Primary Sources` | Keep links in `AGENTS.md`; optionally mirror in docs | Agents must follow live links. These references support the top-priority spec rule. |
| `Testing` | Keep compact matrix or summary in `AGENTS.md`; move expanded matrix to repo testing doc if desired | Validation expectations are operational. The matrix can be referenced from a testing doc only if key gates remain visible. |
| `MCP Agent Mail - Multi-Agent Coordination` | Keep compact mandatory policy in `AGENTS.md`; move tool reference to `.agents/AGENT_MAIL.md` | Agent Mail procedure already has a target. Mandatory registration/reservation/fallback rules stay in `AGENTS.md`. |
| `Beads Workflow Integration` | Keep compact canonical workflow in `AGENTS.md`; move detailed command/reference material to `.agents/skills/beads` | Beads is the work authority. Claim, reserve, close, sync, and push sequence must remain prominent. |
| `Using bv as an AI sidecar` | Move command catalog to `.agents/skills/beads`; keep "use only `--robot-*`" in `AGENTS.md` | Interactive `bv` warning is safety-critical for agents. |
| `br Commands for Issue Management` | Move command catalog to `.agents/skills/beads` | Procedural detail already fits the Beads skill. |
| `Workflow Pattern (canonical - every step is mandatory)` | Keep compact end-to-end checklist in `AGENTS.md`; mirror detail in startup/Beads/Agent Mail skills | This is intentionally repeated across sections. The cross-source redundancy is defensive and should survive. |
| `Key Concepts` | Move most Beads taxonomy to `.agents/skills/beads`; keep owner-gate and durable-memory rules in `AGENTS.md` | Most taxonomy is reference material. Owner gates affect what agents may close. |
| `Complexity Labels` | Move to `.agents/skills/beads` | Beads planning taxonomy, not core repo policy. |
| `Session Protocol` | Delete as duplicate after compaction or replace with pointer to `Landing the Plane` | It is only a pointer today. |
| `ast-grep vs ripgrep` | Move to repo skill or global skill; keep short "use structural tools for rewrites" note in `AGENTS.md` | General tooling guidance with repo relevance. |
| `Morph Warp Grep - AI-Powered Code Search` | Move to repo/global search skill | Tool-specific discovery guidance. Keep only if tool is broadly available in this repo. |
| `Common Workflows` | Move to repo skills | These are compact recipes duplicating startup, protocol-change, and conflict-resolution sections. |
| `Pick up and execute a bead` | Move to `.agents/skills/agent-startup` and `.agents/skills/beads` | Duplicates canonical workflow. |
| `Run a spec-sensitive protocol change` | Keep compact in `AGENTS.md`; move expanded recipe to protocol skill/doc if created | Spec-sensitive workflow reinforces top-priority L402 rules and should stay prominent. |
| `Resolve reservation conflicts` | Move to `.agents/AGENT_MAIL.md`; keep "do not edit conflicting paths" in `AGENTS.md` | Coordination procedure with one hard invariant. |
| `Landing the Plane (Session Completion)` | Keep in `AGENTS.md` | Mandatory push, close-before-release, release reservations, and final mail are hard operating policy. |
| `Note for non-Claude Agents` | Keep compact in `AGENTS.md` | Ensures policy outcomes survive tool differences. This is relevant for Codex and other runtimes. |
| `Escalation` | Keep in `AGENTS.md` | Stop/ask rules for spec ambiguity, destructive actions, validation gaps, and reservation conflicts are hard invariants. |
| `Contribution Policy` | Keep in `AGENTS.md` or move to README; prefer keep compact in `AGENTS.md` | Prevents agents from adding public contribution surfaces while private. |

## Must-Not-Move Invariants

These must remain prominent in `AGENTS.md` even after compaction:

- `AGENTS.md` is the repo operational contract; stop and ask on ambiguity.
- Authority hierarchy: live L402 spec first, then repo contract, then local docs/skills, then global skills, then generic habits.
- Mandatory session start: Agent Mail project, registration, inbox, `bv --robot-triage`, atomic `br update <id> --claim`, reservation, thread announcement.
- L402 spec compliance outranks convenience, performance, brevity, and aesthetics.
- Re-read relevant live spec sections before protocol-surface changes and cite exact sections in commit/PR/change records.
- Aperture is only the ambiguity tiebreaker, not the primary source.
- Conformance fixtures in `@boltwall/test-fixtures` are load-bearing for wire-format changes.
- Unknown caveats are skipped per spec; never rely on unknown caveats failing closed.
- No file or directory deletion unless the owner gives the exact command in the same session.
- No destructive Git/filesystem/package operations without exact owner command, explicit confirmation, and audit trail.
- File reservations must cover reserve, re-read, edit, validate, commit or explicit handoff, then release.
- Do not release a reservation while reserved files remain locally modified.
- Shared write surfaces, including barrels and `bun.lock`, require short critical-section reservations or deferral.
- `bun.lock` is not staged except by a designated lockfile-reconcile bead.
- Implementation beads are complete without public barrel exports unless the bead explicitly requires exports.
- Use Bun only for JS/TS; do not introduce npm/yarn/pnpm lockfiles.
- ESM-only, latest Node LTS, TypeScript strict mode.
- No nested workspace packages; internal workspace dependencies use `workspace:*`.
- `@boltwall/l402` owns protocol behavior; downstream packages do not reimplement wire parsing/verification.
- `@boltwall/test-fixtures` is the single source of truth for wire vectors.
- Validation contract must be understood before implementation starts.
- Public APIs require types and suitable JSDoc; public L402/browser code uses `Uint8Array`, not `Buffer`.
- Lightning amounts use `bigint` millisatoshis; `number` sats is a bug.
- Security boundaries: no secrets, no info-level bearer credential logging, constant-time verification, TLS for documented deployments, invoice amount verification.
- AGPL source is reference-only; do not copy source, comments, tests, or generated docs.
- Use only `bv --robot-*`; bare `bv` can block automation.
- Beads track issue state; Agent Mail tracks agent coordination and reservations.
- Close beads before releasing reservations; do not close with uncommitted changes.
- Work is not complete until code changes are pushed successfully.
- Non-Claude/non-identical runtimes must preserve policy outcomes and document fallbacks.

## Intentional Redundancy To Preserve

These repetitions are defensive, not accidental:

- Session startup appears at the top, under Agent Mail, and in the Beads workflow. Keep one first-screen checklist plus pointers to detailed skill/docs.
- `br update <id> --claim` versus `--status=in_progress` appears multiple times because anonymous in-progress work breaks coordination.
- Reserve-before-edit and do-not-release-with-local-modifications appear in RULE 2, Agent Mail, and Beads completion. Keep the warning in all relevant contexts.
- `bv --robot-*` only appears in Beads and startup guidance because bare `bv` can block an agent session.
- L402 spec-first behavior appears in the top priority section, mission, validation, code quality, testing, and spec-sensitive workflow. Keep it visible in both policy and implementation gates.
- Unknown caveat behavior appears in L402 priority and Security Boundaries because it is both protocol compliance and security posture.
- Shared write surfaces are called out in RULE 2, `bun.lock`, and barrel exports because they are frequent multi-agent conflict points.
- Destructive-command prohibitions appear in RULE 1, irreversible actions, and escalation. Keep all three roles: deletion invariant, command class list, and escalation behavior.
- Push/landing rules appear in the Beads workflow and Landing the Plane because local-only completion is a recurring failure mode.
- AGPL isolation and spec citation requirements should stay visible near both source/reference guidance and change-record guidance.

## Candidate Target Homes

| Target | Should contain |
|---|---|
| Compact `AGENTS.md` | Hard invariants, authority hierarchy, first-screen startup, spec-first policy, no-delete/destructive rules, reservation lifecycle, shared-surface warnings, security/license gates, validation contract, landing sequence, pointers to detailed homes. |
| `.agents/skills/agent-startup/SKILL.md` | Detailed startup and resume procedure, reading order, inbox handling, triage start, initial status checks. |
| `.agents/skills/beads/SKILL.md` | `br`/`bv` command catalogs, robot-mode outputs, Beads taxonomy, complexity labels, dependency planning, close/sync mechanics. |
| `.agents/AGENT_MAIL.md` | Agent Mail tool reference, contact-policy fallback, reservation commands, conflict resolution, message/thread conventions. |
| `.agents/skills/compact-handoff/SKILL.md` | Handoff/resume card mechanics and context budget guidance. |
| Repo architecture doc | Project layout, package responsibilities, monorepo conventions, shared config packages, `turbo.json`, package creation checklist, workspace dependency examples. |
| Repo testing/API docs | Tooling cheatsheet, testing matrix detail, generated API docs guidance, public JSDoc style, package-health expectations. |
| Repo migration docs | Legacy LSAT compatibility inventory, reasons for non-preserved APIs, migration notes. |
| Global skill | Generic `ast-grep` vs `rg` guidance and broad code-search heuristics, unless repo-specific tool availability requires a local skill. |

## Delete-As-Duplicate Candidates

Only delete these after their remaining policy content has a verified home:

- The standalone `Session Protocol` pointer, if `Landing the Plane` remains.
- Repeated command snippets in `Common Workflows`, after equivalent recipes are in repo skills.
- Full tool reference tables in `AGENTS.md`, after `.agents/AGENT_MAIL.md` and `.agents/skills/beads` carry them.
- Large JSON examples for config and Turbo, after a repo architecture doc carries them.

No current security, L402, destructive-action, reservation, validation, or landing behavior is a delete candidate.
