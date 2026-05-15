import { extname, resolve } from "node:path";

import YAML from "yaml";

import { parseBoltwallConfig, type BoltwallConfig } from "./config-schema.js";
import { listSavedConfigs, readTextFile, type SavedBoltwallConfig } from "./config-store.js";

export class BoltwallConfigLoadError extends Error {
  override readonly name = "BoltwallConfigLoadError";
}

export async function loadBoltwallConfig(path: string): Promise<BoltwallConfig> {
  const resolved = resolve(path);
  let content: string;
  try {
    content = await readTextFile(resolved);
  } catch (error) {
    if (isNotFound(error)) {
      throw new BoltwallConfigLoadError(`Config not found: ${resolved}`);
    }
    throw error;
  }

  let raw: unknown;
  try {
    raw = parseConfigText(content, resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BoltwallConfigLoadError(`Unable to parse config ${resolved}: ${message}`);
  }

  return parseBoltwallConfig(raw);
}

export async function findSavedConfig(
  name: string,
  configDir?: string,
): Promise<SavedBoltwallConfig | undefined> {
  const saved = await listSavedConfigs(configDir);
  return saved.find((config) => config.name === name);
}

export function parseConfigText(content: string, path: string): unknown {
  const extension = extname(path);
  if (extension === ".json") return JSON.parse(content);
  if (extension === ".yaml" || extension === ".yml") return YAML.parse(content);
  throw new BoltwallConfigLoadError(`Unsupported config extension: ${extension || "(none)"}`);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
