import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

import YAML from "yaml";

import type { BoltwallConfig } from "./config-schema.js";

const CONFIG_DIR_ENV = "BOLTWALL_CONFIG_DIR";
const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

/** Metadata for one saved Boltwall config file. */
export interface SavedBoltwallConfig {
  /** Config name derived from the filename without extension. */
  name: string;
  /** Absolute or configured path to the saved config file. */
  path: string;
}

/**
 * Resolve the directory used for saved Boltwall config files.
 *
 * Defaults to `~/.config/boltwall` unless `BOLTWALL_CONFIG_DIR` is set.
 *
 * @param env - Env-like record, usually `process.env`.
 * @returns Absolute config directory path.
 */
export function defaultConfigDir(env: Record<string, string | undefined> = process.env): string {
  return resolve(env[CONFIG_DIR_ENV] ?? join(homedir(), ".config", "boltwall"));
}

/**
 * List saved JSON and YAML config files in a config directory.
 *
 * Missing directories are treated as empty so first-run CLI flows can start
 * without a bootstrap step.
 *
 * @param configDir - Directory to scan.
 * @returns Saved configs sorted by filename.
 */
export async function listSavedConfigs(
  configDir = defaultConfigDir(),
): Promise<SavedBoltwallConfig[]> {
  let entries: string[];
  try {
    entries = await readdir(configDir);
  } catch (error) {
    if (isNotFound(error)) return [];
    throw error;
  }

  return entries
    .filter((entry) => CONFIG_EXTENSIONS.has(extname(entry)))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => ({
      name: basename(entry, extname(entry)),
      path: join(configDir, entry),
    }));
}

/**
 * Build the canonical YAML path for a saved config name.
 *
 * @param name - User-facing config name.
 * @param configDir - Optional directory override.
 * @returns Path ending in a sanitized `.yaml` filename.
 */
export function configPathForName(name: string, configDir = defaultConfigDir()): string {
  return join(configDir, `${safeConfigName(name)}.yaml`);
}

/**
 * Build the directory used for generated deployment files for a config.
 *
 * @param name - User-facing config name.
 * @param configDir - Optional directory override.
 * @returns Deployment directory path.
 */
export function deploymentDirForConfig(name: string, configDir = defaultConfigDir()): string {
  return join(configDir, "deployments", safeConfigName(name));
}

/**
 * Save a validated config as YAML with owner-only file permissions.
 *
 * @param config - Validated saved proxy config.
 * @param path - Optional output path. Defaults to `configPathForName`.
 * @returns Path written.
 */
export async function saveConfig(config: BoltwallConfig, path?: string): Promise<string> {
  const outPath = path ?? configPathForName(config.name ?? "default");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, YAML.stringify(serializableConfig(config)), { mode: 0o600 });
  return outPath;
}

/**
 * Read a UTF-8 text file.
 *
 * Exported so tests and config-loading helpers use one filesystem boundary.
 */
export async function readTextFile(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

function safeConfigName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.length === 0 ? "default" : normalized;
}

function serializableConfig(config: BoltwallConfig): Record<string, unknown> {
  const { deploy, ...rest } = config;
  if (deploy.projectName === undefined) return rest;
  return { ...rest, deploy };
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
