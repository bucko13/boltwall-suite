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
6. Reserve files via `file_reservation_paths` BEFORE editing.
7. Announce in-thread via `send_message(thread_id="<bead-id>")` so peers can see what you're doing.

Skipping any of steps 1–3 leaves you invisible to peer agents and breaks reservation safety. Skipping step 5's `--claim` flag (using `--status=in_progress` alone) leaves the assignee field null and creates the same coordination failure even if you registered. The full canonical workflow is documented in `Beads Workflow Integration → Workflow Pattern (canonical — every step is mandatory)` later in this file.

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

## Project Architecture

Boltwall Suite is a **TypeScript monorepo** for L402 (Lightning Network service authentication). Layout:

```
boltwall-suite/
├── apps/
│   └── playground/                 # @boltwall/playground (Next.js, private)
├── packages/
│   ├── l402/                       # @boltwall/l402 (browser+node protocol lib)
│   ├── middleware/                 # @boltwall/middleware (Web Fetch core + Express adapter)
│   ├── adapters/                   # @boltwall/adapters (Lightning backends, subpath exports)
│   ├── proxy/                      # @boltwall/proxy (reverse proxy package + CLI)
│   ├── internal/                   # @boltwall/internal (private — small shared runtime utilities)
│   ├── test-fixtures/              # @boltwall/test-fixtures (private — L402 conformance vectors)
│   ├── eslint-config/              # @boltwall/eslint-config (private — shared ESLint flat config)
│   ├── typescript-config/          # @boltwall/typescript-config (private — shared tsconfig presets)
│   └── prettier-config/            # @boltwall/prettier-config (private — shared Prettier config)
├── templates/proxy-vercel/         # deploy-button template
├── examples/                       # standalone consumer examples
├── docs/                           # flat architectural docs
├── .github/workflows/
├── .changeset/
├── turbo.json                      # task pipeline definitions
├── package.json                    # workspace root
└── ...
```

Key patterns:

- `@boltwall/l402` is the foundation. Middleware, proxy, and playground consume it; they do **not** re-implement wire parsing or verification.
- `@boltwall/middleware` is split: a Web Fetch core (`(req: Request, config) => Promise<L402GateResult>`) plus an Express adapter. Hono / Next.js Route Handlers / Bun.serve / Deno consume the core directly via documented one-line patterns — no separate adapter packages.
- `@boltwall/adapters` uses subpath exports (`@boltwall/adapters/lnd`, `/opennode`, `/btcpay`, `/testing`) so consumers don't pull in unused backend dependencies.
- `@boltwall/internal` houses small shared utilities under ~200 lines each (see Dependency Policy below).
- `@boltwall/test-fixtures` is the single source of truth for L402 wire vectors. No package gets its own private interpretation of the wire format.

When adding features:

- Add to the smallest package that can host the change. Prefer extending an existing module over creating a new one.
- Follow existing patterns for packages, exports, and capability flags.
- Test under both Node and the Playwright Chromium browser-import suite for anything in `@boltwall/l402`.

---

## Monorepo Conventions (Turborepo + Bun workspaces)

This repo uses **Bun workspaces** for package management and **Turborepo** for task orchestration and caching. The following conventions are non-negotiable. Per Turborepo guidance, all packages live exactly one directory deep under `apps/` or `packages/` — **no nested packages** like `apps/foo/bar` or `packages/group/lib`. Package managers handle nesting ambiguously; we don't.

### Shared configuration packages

Tool configurations are shared via **dedicated workspace packages**, not via duplicated config files in each package. Each shared-config package is private (`"private": true`) and is consumed via `workspace:*`.

| Config | Package | Exports |
|---|---|---|
| ESLint flat config | `@boltwall/eslint-config` | `base.js`, `node.js`, `browser.js`, `react.js`, `next.js` (one preset per surface) |
| TypeScript | `@boltwall/typescript-config` | `base.json`, `library.json`, `node.json`, `browser.json`, `nextjs.json` |
| Prettier | `@boltwall/prettier-config` | A single default config object exported as the package main |

**Consuming a shared config from a package:**

```jsonc
// packages/<pkg>/package.json
{
  "devDependencies": {
    "@boltwall/eslint-config": "workspace:*",
    "@boltwall/typescript-config": "workspace:*",
    "@boltwall/prettier-config": "workspace:*"
  }
}
```

```js
// packages/<pkg>/eslint.config.js
import baseConfig from "@boltwall/eslint-config/browser.js";

export default [
  ...baseConfig,
  // package-specific overrides only
];
```

```jsonc
// packages/<pkg>/tsconfig.json
{
  "extends": "@boltwall/typescript-config/library.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

```jsonc
// packages/<pkg>/package.json (Prettier config — option A: re-export)
{
  "prettier": "@boltwall/prettier-config"
}
```

**Rules:**

- Never copy lint/TS/Prettier config wholesale into a package. Extend the shared package and add narrow overrides.
- Never add ESLint plugins or TS lib dependencies to individual packages — they go in the shared config package's `devDependencies` and are resolved transitively.
- Never put runtime code in a config package, and never put config in `@boltwall/internal`.

### Workspace dependency protocol

Internal dependencies always use the `workspace:*` protocol (Bun and Turborepo both support it):

```jsonc
{
  "dependencies": {
    "@boltwall/l402": "workspace:*",
    "@boltwall/internal": "workspace:*"
  }
}
```

Never use `file:` paths, relative paths, or version numbers for workspace packages. `workspace:*` is the only correct form. Bun rewrites it to a real version on publish.

### Cross-package code reuse — where does shared code live?

| What you're sharing | Where it lives |
|---|---|
| Small runtime utilities used in 2+ packages, each ≤~200 lines | `@boltwall/internal` (private) |
| Larger shared runtime code that has its own coherent surface | A new dedicated package under `packages/` |
| ESLint / Prettier / TypeScript configs | `@boltwall/eslint-config` / `@boltwall/prettier-config` / `@boltwall/typescript-config` |
| L402 wire vectors and protocol fixtures | `@boltwall/test-fixtures` (private) |
| Public protocol API consumed by middleware/proxy/playground | `@boltwall/l402` |

If you find yourself copying a function between two packages: stop and lift it into the appropriate shared package above. Code duplication across workspace packages is a smell.

### Third-party dependencies — package-level, not centralized

Each package declares its own third-party dependencies in its own `package.json`. Bun handles hoisting at install time. **Do not** try to centralize third-party deps via a meta-package. Specifically:

- If `@boltwall/l402` and `@boltwall/middleware` both use `@noble/hashes`, they each list `@noble/hashes` in their own `dependencies`. Same version range, ideally. Bun de-duplicates on disk.
- The `@boltwall/internal` package is for *our* utilities, not for re-exporting third-party deps.
- The dep policy in §Dependency Policy still applies — every external dep needs the ~200-line justification.

### `turbo.json` task pipeline

The root `turbo.json` defines the task graph. Canonical pipeline:

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    },
    "test:browser": {
      "dependsOn": ["build"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "package-health": {
      "dependsOn": ["build"]
    },
    "size": {
      "dependsOn": ["build"]
    },
    "dev": {
      "persistent": true,
      "cache": false
    }
  }
}
```

**Conventions:**

- `^build` means "run `build` in upstream workspace dependencies first." Use it whenever a task consumes built artifacts of another workspace package.
- `outputs` MUST list every directory that the task writes to be cached. Missing `outputs` means cache hits restore nothing.
- `inputs` defaults to all Git-tracked files in the package. Override only when a task should run on a narrower set (e.g., docs-only checks).
- `cache: false` only for tasks with side effects (deploys) or genuinely non-deterministic (e2e, dev servers).
- `persistent: true` for long-running tasks (`dev`).
- Use `bun run <task>` at the root to invoke Turbo; package-level scripts run via `turbo run <task> --filter=@boltwall/<pkg>`.

### Adding a new package

Checklist:

1. Create directory under `packages/` (or `apps/` if it's an app). Single level only — no nesting.
2. Add `package.json` with:
   - `"name": "@boltwall/<name>"`
   - `"private": true` if it should not publish, otherwise omit.
   - `"type": "module"` (ESM-only).
   - `"exports"` map (subpath exports as needed).
   - `"scripts"`: at minimum `build`, `lint`, `typecheck`, `test`.
   - `"devDependencies"`: `@boltwall/eslint-config`, `@boltwall/typescript-config`, `@boltwall/prettier-config` via `workspace:*`.
3. Add `eslint.config.js` extending the appropriate `@boltwall/eslint-config` preset.
4. Add `tsconfig.json` extending the appropriate `@boltwall/typescript-config` preset.
5. Add `prettier` field in `package.json` pointing at `@boltwall/prettier-config`.
6. Wire `bun.lock` via `bun install` at the workspace root. Never edit lockfiles by hand.
7. If the package is publishable (`@boltwall/l402`, `@boltwall/middleware`, `@boltwall/adapters`, `@boltwall/proxy`):
   - Add `publint` and `arethetypeswrong` to its `package-health` script.
   - Verify `exports` map is correct for ESM consumers.
   - Confirm no `Buffer` or `node:*` imports leak into browser bundles (where applicable).
8. If the package needs Turbo task overrides, add them to the root `turbo.json` — never duplicate the root `turbo.json` inside the package.

### What does NOT live in shared packages

- Phase-specific or workflow-specific logic.
- One-off scripts (those go in the package that uses them, or in `scripts/` at the root if truly cross-cutting).
- Generated code (build outputs in `dist/`, never committed).

---

## Mission and Non-Goals

**Mission.** Maintain a spec-correct L402 toolchain: protocol library, server middleware, deployable proxy, demo playground, shared adapters for Lightning backends. Browser-and-Node, aperture-compatible, MIT-licensed, published under the `@boltwall` npm scope.

**Non-goals:**

- gRPC L402.
- Edge runtime support for middleware/proxy (Cloudflare Workers, Vercel Edge).
- CLN and LDK adapters (interface designed-for, not shipped).
- CJS builds.
- Older browsers.
- Hosted SaaS proxy.
- Browser extension version of the playground.
- Fastify / Koa / Hapi middleware adapters (Web-Fetch-native runtimes consume the core directly).

**Spec citations beat opinions.** Any change to wire format, status codes, header parsing, caveat semantics, or macaroon binary handling MUST cite the relevant section of the L402 spec. Citations are recorded in commit messages and code comments.

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

1. **The relevant exit criteria** for the bead/task at hand.
2. **Testing expectations** (see Testing section below).
3. **Security boundaries** (see Security Boundaries section).
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

**Prefer `@boltwall/internal` over external deps when the functionality fits in under ~200 lines.**

Before running `bun add <some-pkg>`, consider whether the same functionality could be implemented as a small utility in `@boltwall/internal`. If yes — under ~200 lines of well-commented TypeScript with positive and negative tests — build it there. The 200-line threshold is the rough complexity boundary where maintaining a small internal implementation is cheaper than absorbing a transitive dependency tree, supply-chain surface, license review, and version drift over the project's lifetime.

**Almost always internal:**
- Base64url encode/decode helpers
- Hex ↔ `Uint8Array` converters
- Constant-time byte-array comparison (`Uint8Array`-native)
- Small parsers, tokenizers, validators
- Header-grammar utilities

**Almost always external:**
- Cryptographic primitives (use `@noble/hashes`, WebCrypto)
- Well-established protocol implementations (BOLT 11 decoders, macaroon binary format)
- Large parsers
- Framework integrations

Every external-dep addition justifies the choice in the change record: "I considered building this in `@boltwall/internal` but [reason]."

When unsure of an API on a third-party library, look up current docs rather than guessing.

**Cross-reference:** The "Monorepo Conventions" section above governs *where* shared code lives once you've decided to share it. This section governs *whether* something should be a dependency at all. Both apply simultaneously.

---

## Code Quality Bar

- All public APIs need TypeScript types — no `any` exports.
- Public exports intended for package consumers need JSDoc comments suitable for generated API documentation. Document what the symbol does, important parameters, return values, thrown errors, security-sensitive behavior, and spec references where relevant.
- Public API in `@boltwall/l402` uses `Uint8Array` and `string`, not `Buffer`. `Buffer` is forbidden in any code that ships to the browser bundle.
- All wire-format code carries a spec citation as a code comment (one of the rare cases comments are warranted).
- New caveat helpers ship with positive AND negative test vectors, including attenuation chains where applicable.
- New backend adapters ship with capability flags accurate to the implementation.
- Lightning amounts use `bigint` millisatoshis throughout. `number` sats is a bug.

### Generated API Docs

Public package documentation is generated from TypeScript signatures and JSDoc, similar in spirit to the legacy LSAT library docs. Treat public comments as part of the API contract:

- Add JSDoc when creating or changing exported functions, classes, interfaces, type aliases, errors, config objects, adapters, and framework helpers.
- Keep comments factual and maintenance-friendly. Do not paste long spec text; cite the relevant spec/source and describe the local behavior.
- Document compatibility behavior explicitly, especially dual LSAT/L402 challenge emission, legacy LSAT parsing/emission, Aperture interop, caveat handling, and browser-vs-Node constraints.
- Internal helpers only need comments when the behavior is subtle. Do not bury public API documentation on private implementation details.
- Generated docs must build cleanly before v0.1.0 stabilization.

---

## Security Boundaries

- **No credentials, API keys, root keys, production macaroons, or `.env` files committed — ever.** `.gitignore` covers common cases; verify before staging.
- **Bearer-credential handling.** Macaroons and preimages must not be logged at info level. Pino redaction config lives in `packages/middleware/src/logger.ts`.
- **Constant-time comparison required** on the server verification path (signature equality, payment-hash equality). Use `crypto.timingSafeEqual` server-side. Browser code uses a `Uint8Array`-native helper from `@boltwall/internal` (raw `===` on byte arrays leaks timing).
- **TLS required** for any documented deployment path. Examples that omit TLS must say so loudly with a banner.
- **Invoice amount verification.** Middleware MUST verify the bolt11 amount matches the configured price. Skipping this is a security bug, not a feature.
- **Unknown-caveat security model.** Per L402 spec, unknown caveats are *skipped* when no satisfier matches. The middleware therefore declares and verifies the *known* caveats it depends on. **Never rely on unknown caveats failing closed.**

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

```sh
bun test                                 # unit tests, all packages
bun test --filter @boltwall/l402         # one package
bun run test:browser                     # Playwright Chromium import test (verifies built ESM imports cleanly with no Node-only references)
bun run test:e2e                         # Playwright e2e for playground
```

### Testing expectations by change type

| Change type | Required tests |
|---|---|
| Bug fix | Failing regression test before fix; fix flips it green |
| New caveat helper | Positive + negative vectors in `@boltwall/test-fixtures`; `satisfyPrevious` attenuation case if applicable |
| New backend adapter | Capability flags accurate; `MockAdapter` parity test; nightly real-endpoint test (when available); capability-mismatch boot rejection test |
| New public API | Typed signature + JSDoc + README example that compiles |
| Wire-format change | Spec citation in change record; dual-scheme tests; multi-macaroon tests where relevant; conformance fixture round-trip |
| Cross-runtime change in `@boltwall/l402` | Playwright Chromium import test green; built ESM has no `node:*` references |
| Playground UI change | Playwright e2e covering the new flow; visual regression for desktop + mobile |
| Pricing/invoice change | `bigint` round-trip test; invoice amount verification test |
| Security boundary touched | Explicit test for the boundary (e.g., timing-attack regression for constant-time comparison) |

---

## MCP Agent Mail — Multi-Agent Coordination

Agent Mail is available as an MCP server for coordinating work across agents. **This is the primary mechanism for multi-agent work delegation in this repo.**

> **Mandatory at session start:** call `ensure_project` + `register_agent` + `fetch_inbox` BEFORE running `bv --robot-triage` or `br update --claim`. See `Beads Workflow Integration → Step 0 — Session start` for the exact sequence. Agents that skip this are invisible to peers and break file-reservation safety.

What Agent Mail provides:

- Identities, inbox/outbox, searchable threads.
- Advisory file reservations (leases) so agents don't clobber each other.
- Persistent artifacts in git (human-auditable).

### Core patterns

The `project_key` is the absolute path to this repository on the current machine. Do not commit personal home-directory paths; use `<repo-root>` in examples and substitute the real absolute path only in local tool calls.

1. **Register identity.**
   - `ensure_project` then `register_agent` with `project_key=<repo-root>`.

2. **Reserve files before editing.**
   - `file_reservation_paths(project_key, agent_name, ["packages/l402/**"], ttl_seconds=3600, exclusive=true, reason="<bead-or-task-id>")`
   - Use the narrowest pattern that covers your edit surface. Don't reserve `**` unless you genuinely need the whole tree.

3. **Communicate.**
   - `send_message(..., thread_id="<bead-id>")`.
   - `fetch_inbox`, then `acknowledge_message`.

4. **Fast reads.**
   - `resource://inbox/{Agent}?project=<repo-root>&limit=20`.
   - `resource://thread/{id}?project=<repo-root>&include_bodies=true`.

### Macros vs granular

- Prefer macros when speed matters more than fine-grained control:
  - `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`.
- Use granular tools when explicit behavior is needed.

### Common pitfalls

- `from_agent not registered` → call `register_agent` with the correct `project_key` (absolute repo path).
- `FILE_RESERVATION_CONFLICT` → narrow your patterns, wait for expiry, or use a non-exclusive reservation.

### When to use Mail vs other coordination

- **Mail** = agent-to-agent coordination: messaging, work claiming, file reservations, hand-offs.
- **Beads (bv)** = "what to work on": triage, priority, dependency-aware planning. See below.

These are complementary, not redundant. Don't use Mail to track issue state (that's Beads). Don't use Beads for inter-agent messaging (that's Mail).

<!-- bv-agent-instructions-v2 -->

---

## Beads Workflow Integration

This project uses [beads_rust](https://github.com/Dicklesworthstone/beads_rust) (`br`) for issue tracking and [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) (`bv`) for graph-aware triage. Issues are stored in `.beads/` and tracked in git.

`br` (beads_rust) is non-invasive and never executes git commands. You must run git commands manually after `br sync --flush-only`.

### Step 0 — Session start (run BEFORE any other work)

**Before picking, claiming, or touching a single bead, complete these registration steps. Skipping them leaves you invisible to peer agents and unable to coordinate edits.**

1. **Register identity with Mail.**
   - `mcp__mcp-agent-mail__ensure_project` with `project_root=<repo-root>` (idempotent — safe to run every session).
   - `mcp__mcp-agent-mail__register_agent` with the same `project_key` and a stable `agent_name` (use the same name across sessions so your inbox/outbox history is continuous).
2. **Check inbox.**
   - `mcp__mcp-agent-mail__fetch_inbox` — respond to or acknowledge anything addressed to you before grabbing new work. Pending coordination requests trump fresh tasks.
3. **THEN triage.**
   - Only after the two steps above, run `bv --robot-triage` and pick a bead.

If `register_agent` returns `from_agent not registered` or similar, fix the `project_key` (must be the absolute repo path) and retry. Do not proceed without a registered identity — it breaks all subsequent Mail calls.

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

This is the single workflow contract. The shorter "Triage → Claim → Work → Complete → Sync" framing that used to live here was incomplete: it omitted Mail registration, file reservations, and the in-thread announce, and it caused at least one agent to start work without ever registering with Mail. Follow the full sequence below.

0. **Session start** — see `Step 0 — Session start` above. Mail `ensure_project` + `register_agent` + `fetch_inbox` must complete before you triage. This is not optional.
1. **Triage.** `bv --robot-triage` → pick a bead from `recommendations`. Skip beads labeled `requires-owner` unless your work is to prepare artifacts for owner review.
2. **Claim atomically.** `br update <id> --claim` (the `--claim` flag sets BOTH `status=in_progress` AND `assignee=<your agent name>` in one operation). Do **not** use `br update <id> --status=in_progress` alone — that leaves `assignee` null and peer agents cannot see who owns the work.
3. **Reserve edit surface (Mail).** `mcp__mcp-agent-mail__file_reservation_paths(project_key="<repo-root>", agent_name=<you>, paths=[...narrowest pattern that covers your edits...], ttl_seconds=3600, exclusive=true, reason="<bead-id>")`. Reserve before editing — not after.
4. **Announce start (Mail).** `mcp__mcp-agent-mail__send_message(..., thread_id="<bead-id>", subject="[<bead-id>] Start: <short title>", ack_required=true)`. One thread per bead id, persistent for the bead's lifetime.
5. **Work.** Implement the task. Reply in-thread on meaningful progress and at handoff points.
6. **Complete.** `br close <id> --reason "Completed: <one-line summary>"`. Beads is the status authority — close the bead BEFORE releasing reservations.
7. **Release reservations (Mail).** `mcp__mcp-agent-mail__release_file_reservations(project_key=..., agent_name=<you>, paths=[...same patterns...])`. Final mail reply: `[<bead-id>] Completed` with summary + commit hash.
8. **Sync + push.** `br sync --flush-only` exports `.beads/` changes; then `git add` / `git commit` / `git push` per "Landing the Plane" below. Work is NOT done until `git push` succeeds.

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

```bash
git status              # Check what changed
git add <files>         # Stage code changes
br sync --flush-only    # Export beads changes to JSONL
git commit -m "..."     # Commit everything
git push                # Push to remote
```

<!-- end-bv-agent-instructions -->

### Picking up a bead-tracked task

See `Workflow Pattern (canonical — every step is mandatory)` above for the full sequence (steps 0–8). This subsection is a quick reference, not a substitute. If anything here conflicts with the canonical workflow, the canonical workflow wins.

Reservation/announce examples for a bead `br-123`:

```text
file_reservation_paths(project_key="<repo-root>",
                       agent_name=<you>,
                       paths=["packages/l402/**"],
                       ttl_seconds=3600,
                       exclusive=true,
                       reason="br-123")

send_message(..., thread_id="br-123",
             subject="[br-123] Start: <short title>",
             ack_required=true)

# on completion:
br close br-123 --reason "Completed: <summary>"
release_file_reservations(project_key="<repo-root>",
                          agent_name=<you>,
                          paths=["packages/l402/**"])
send_message(..., thread_id="br-123", subject="[br-123] Completed", ...)
```

### Mapping cheat-sheet

- **Mail `thread_id`** ↔ `br-###`
- **Mail subject**: `[br-###] ...`
- **File reservation `reason`**: `br-###`
- **Commit messages (recommended)**: include `br-###` for traceability

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

Concrete recipes are filled in as the corresponding work lands. Stubs:

1. **Adding a new caveat type** — where it lives, the satisfier pattern (`satisfyPrevious` + `satisfyFinal`), vector requirements in `@boltwall/test-fixtures`.
2. **Adding a new Lightning backend adapter** — the `LightningBackend` interface, capability flags, `MockAdapter` parity test, integration test requirement.
3. **Adding a framework adapter to `@boltwall/middleware`** — when an adapter is needed (Express-style frameworks) vs when the core is consumed directly (Web-Fetch-native runtimes).
4. **Cutting a release** — changeset → version PR → publish flow, npm provenance, badge updates.
5. **Updating an architectural doc** — when to amend `docs/protocol-compatibility.md` vs `docs/security-model.md` vs `docs/package-boundaries.md`.
6. **Running cross-runtime tests** — how to reproduce a Playwright Chromium failure locally.
7. **Running aperture interop** — Docker compose recipe.
8. **Making a wire-format change** — required spec citation, conformance fixture update, dual-scheme test coverage, multi-macaroon test coverage, `docs/protocol-compatibility.md` update.

When a workflow becomes load-bearing, expand the relevant entry above with copy-paste commands and cross-links.

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
   br sync --flush-only
   git add .beads/
   git add <other staged paths>            # avoid `git add -A` unless verified clean
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

If you are not Claude (Codex, Gemini, GPT, Copilot, or any other agent): another agent — likely Claude Code — may have made changes to the working tree since you last saw it. Before assuming your mental model of the code is correct:

1. Run `git status` to see uncommitted changes.
2. Run `git log --oneline -10` to see recent commits.
3. Re-read any files you plan to modify.
4. Check Mail inbox for messages addressed to you (`fetch_inbox` or `resource://inbox/{Agent}`).
5. Check Beads for assignments (`br ready --json`, `bv --robot-triage`).

This prevents you from overwriting another agent's work or making edits based on stale context.

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
