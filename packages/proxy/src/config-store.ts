import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

import YAML from "yaml";

import type { BoltwallConfig } from "./config-schema.js";

const CONFIG_DIR_ENV = "BOLTWALL_CONFIG_DIR";
const CONFIG_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

export interface SavedBoltwallConfig {
  name: string;
  path: string;
}

export function defaultConfigDir(env: Record<string, string | undefined> = process.env): string {
  return resolve(env[CONFIG_DIR_ENV] ?? join(homedir(), ".config", "boltwall"));
}

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

export function configPathForName(name: string, configDir = defaultConfigDir()): string {
  return join(configDir, `${safeConfigName(name)}.yaml`);
}

export function deploymentDirForConfig(name: string, configDir = defaultConfigDir()): string {
  return join(configDir, "deployments", safeConfigName(name));
}

export async function saveConfig(config: BoltwallConfig, path?: string): Promise<string> {
  const outPath = path ?? configPathForName(config.name ?? "default");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, YAML.stringify(serializableConfig(config)), { mode: 0o600 });
  return outPath;
}

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
