import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

type Manifest = {
  name: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const publicPackages = ["l402", "middleware", "adapters", "proxy"] as const;
const forbiddenPackage = "@boltwall/internal";
const forbiddenImportPattern =
  /(?:from\s+["']|import\s*\(\s*["'])@boltwall\/internal(?:\/[^"']*)?["']/;
const errors: string[] = [];

const readManifest = (
  packageName: (typeof publicPackages)[number],
): Manifest => {
  const path = join("packages", packageName, "package.json");
  return JSON.parse(readFileSync(path, "utf8")) as Manifest;
};

const collectPackedArtifacts = (dir: string): string[] => {
  if (!existsSync(dir)) {
    errors.push(
      `${dir} is missing; run package-health after build output exists`,
    );
    return [];
  }

  const artifacts: string[] = [];
  const visit = (current: string) => {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stats = statSync(path);
      if (stats.isDirectory()) {
        visit(path);
        continue;
      }

      if (path.endsWith(".js") || path.endsWith(".d.ts")) {
        artifacts.push(path);
      }
    }
  };

  visit(dir);
  return artifacts;
};

for (const packageName of publicPackages) {
  const manifest = readManifest(packageName);
  if (manifest.private === true) {
    errors.push(
      `${manifest.name} is marked private but is in the public package list`,
    );
  }

  for (const field of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
  ] as const) {
    if (manifest[field]?.[forbiddenPackage]) {
      errors.push(
        `${manifest.name} lists ${forbiddenPackage} in runtime ${field}`,
      );
    }
  }

  for (const artifactPath of collectPackedArtifacts(
    join("packages", packageName, "dist"),
  )) {
    const artifact = readFileSync(artifactPath, "utf8");
    if (forbiddenImportPattern.test(artifact)) {
      errors.push(
        `${artifactPath} imports ${forbiddenPackage}; bundle private helpers instead`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("Public package boundary check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Public package boundary check passed.");
