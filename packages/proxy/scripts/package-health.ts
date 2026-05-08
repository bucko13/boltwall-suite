import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Manifest = {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, "..");
const repoRoot = resolve(packageDir, "..", "..");

const workspaceManifests = new Map<string, Manifest>();

for (const globBase of ["packages", "apps"]) {
  const baseDir = join(repoRoot, globBase);
  if (!existsSync(baseDir)) {
    continue;
  }

  for (const entry of new Bun.Glob("*/package.json").scanSync({ cwd: baseDir })) {
    const manifestPath = join(baseDir, entry);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
    workspaceManifests.set(manifest.name, manifest);
  }
}

const readManifest = (manifestPath: string) =>
  JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

const rewriteWorkspaceVersions = (manifest: Manifest): Manifest => {
  const rewritten = structuredClone(manifest);

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    const deps = rewritten[field];
    if (!deps) {
      continue;
    }

    for (const [dependencyName, dependencyVersion] of Object.entries(deps)) {
      if (!dependencyVersion.startsWith("workspace:")) {
        continue;
      }

      const workspaceManifest = workspaceManifests.get(dependencyName);
      if (!workspaceManifest) {
        throw new Error(`Unable to resolve workspace package ${dependencyName}`);
      }

      deps[dependencyName] = workspaceManifest.version;
    }
  }

  return rewritten;
};

const run = (cmd: string[], cwd: string, env?: Record<string, string>) => {
  const result = Bun.spawnSync(cmd, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed with exit code ${result.exitCode}`);
  }
};

const manifest = rewriteWorkspaceVersions(readManifest(join(packageDir, "package.json")));
const stagingRoot = join(
  tmpdir(),
  `boltwall-package-health-${manifest.name.replaceAll("/", "-")}-${Date.now()}`,
);
const stagingPackageDir = join(stagingRoot, "package");
const tarballPath = join(stagingRoot, `${manifest.name.split("/").at(-1)}-${manifest.version}.tgz`);

mkdirSync(stagingPackageDir, { recursive: true });
cpSync(join(packageDir, "dist"), join(stagingPackageDir, "dist"), { recursive: true });
writeFileSync(
  join(stagingPackageDir, "package.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

run(["bunx", "publint", "run", ".", "--pack", "false"], packageDir);
run(
  ["tar", "--format", "ustar", "-czf", tarballPath, "-C", stagingRoot, "package"],
  packageDir,
  { COPYFILE_DISABLE: "1" },
);
// Boltwall packages are intentionally ESM-only, so ATTW should evaluate the
// published tarball against the matching consumer profile.
run(["bunx", "attw", "--profile", "esm-only", tarballPath], packageDir);
