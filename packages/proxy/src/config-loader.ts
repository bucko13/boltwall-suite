import { extname, resolve } from "node:path";

import YAML from "yaml";

import { parseBoltwallConfig, type BoltwallConfig } from "./config-schema.js";
import { listSavedConfigs, readTextFile, type SavedBoltwallConfig } from "./config-store.js";

/** Thrown when a saved config file cannot be found, parsed, or validated. */
export class BoltwallConfigLoadError extends Error {
  override readonly name = "BoltwallConfigLoadError";
}

/**
 * Read, parse, and validate a saved Boltwall config file.
 *
 * JSON, YAML, and YML files are supported. File-not-found and parse errors are
 * wrapped with the resolved path so CLI output is actionable.
 *
 * @param path - Config file path.
 * @returns Validated saved proxy config.
 * @throws {BoltwallConfigLoadError} when the file is missing or cannot be parsed.
 * @throws {BoltwallConfigError} when parsed content fails schema validation.
 */
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

/**
 * Find a config saved under the configured Boltwall config directory.
 *
 * @param name - Saved config name without extension.
 * @param configDir - Optional directory override.
 * @returns Saved config metadata, or `undefined` when no match exists.
 */
export async function findSavedConfig(
  name: string,
  configDir?: string,
): Promise<SavedBoltwallConfig | undefined> {
  const saved = await listSavedConfigs(configDir);
  return saved.find((config) => config.name === name);
}

/**
 * Parse JSON or YAML config text based on filename extension.
 *
 * @param content - Raw file content.
 * @param path - Path used to choose parser and report errors.
 * @returns Parsed JSON/YAML value.
 * @throws {BoltwallConfigLoadError} when the extension is unsupported.
 */
export function parseConfigText(content: string, path: string): unknown {
  const extension = extname(path);
  if (extension === ".json") return JSON.parse(content);
  if (extension === ".yaml" || extension === ".yml") return YAML.parse(content);
  throw new BoltwallConfigLoadError(`Unsupported config extension: ${extension || "(none)"}`);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
