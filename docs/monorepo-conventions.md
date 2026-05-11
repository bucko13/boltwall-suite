# Monorepo Conventions

Boltwall Suite uses Bun workspaces and Turborepo.

## Hard Rules

- Use Bun for package management and scripts.
- Packages live exactly one directory deep under `apps/` or `packages/`.
- Do not create nested packages.
- Internal workspace dependencies use `workspace:*`.
- Shared tool configuration lives in dedicated workspace config packages.
- Package-level third-party dependencies stay in each package that uses them.

## Shared Configuration Packages

| Config | Package | Exports |
|---|---|---|
| ESLint flat config | `@boltwall/eslint-config` | `base.js`, `node.js`, `browser.js`, `react.js`, `next.js` |
| TypeScript | `@boltwall/typescript-config` | `base.json`, `library.json`, `node.json`, `browser.json`, `nextjs.json` |
| Prettier | `@boltwall/prettier-config` | default config object |

Packages consume shared config via `workspace:*` dev dependencies and extend the
appropriate preset. Do not copy lint, TypeScript, or Prettier config wholesale
into packages.

## Workspace Dependencies

Use `workspace:*` for internal packages:

```jsonc
{
  "dependencies": {
    "@boltwall/l402": "workspace:*",
    "@boltwall/internal": "workspace:*"
  }
}
```

Do not use `file:`, relative paths, or version numbers for workspace packages.

## Shared Code Placement

| Shared code | Home |
|---|---|
| Small runtime utilities used in multiple packages | `@boltwall/internal` |
| Larger shared runtime surface | new package under `packages/` |
| ESLint, Prettier, TypeScript configs | config packages |
| L402 wire vectors and protocol fixtures | `@boltwall/test-fixtures` |
| Public protocol API | `@boltwall/l402` |

If a function is copied between packages, lift it into the appropriate shared
package.

## Third-Party Dependencies

Each package declares its own third-party dependencies. Do not centralize
third-party dependencies in a meta-package, and do not re-export third-party
dependencies from `@boltwall/internal`.

## Turbo

Root `turbo.json` owns the task graph. Use `bun run <task>` at the root. Package
scripts run through Turbo filters when needed.

Conventions:

- Use `^build` when a task consumes built artifacts from workspace dependencies.
- `outputs` must list cached output directories.
- Override `inputs` only for deliberately narrower tasks.
- Use `cache: false` only for side-effecting or nondeterministic tasks.
- Use `persistent: true` for long-running dev servers.

## Adding A Package

1. Create one directory under `packages/` or `apps/`.
2. Add ESM `package.json` with exports, scripts, and shared config
   dependencies.
3. Add shared ESLint, TypeScript, and Prettier config wiring.
4. Run `bun install` at the workspace root; never edit lockfiles by hand.
5. For publishable packages, add package-health checks and verify browser-safe
   exports where relevant.
6. Add root `turbo.json` overrides only when needed.
