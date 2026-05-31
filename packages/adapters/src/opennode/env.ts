import type { AdapterEnvVariableMetadata } from "../types";

import { OpenNodeApiError } from "./rest-client";

const OPENNODE_API_KEY_ENV = "OPENNODE_API_KEY";
const OPENNODE_BASE_URL_ENV = "OPENNODE_BASE_URL";

/**
 * Environment variables supported by `loadOpenNodeEnv`.
 *
 * The values are metadata only. Secret variables are marked so reference
 * output, CLIs, and tests can describe the supported configuration without
 * echoing credential values.
 */
export const openNodeEnvVariables = [
  {
    name: OPENNODE_API_KEY_ENV,
    required: true,
    mapsTo: "apiKey",
    valueType: "string",
    secret: true,
    description: "OpenNode API key from the development or production dashboard.",
  },
  {
    name: OPENNODE_BASE_URL_ENV,
    required: false,
    mapsTo: "baseUrl",
    valueType: "url",
    defaultValue: "https://api.opennode.com",
    description:
      "Optional OpenNode API base URL. Use https://dev-api.opennode.com with development-environment keys.",
  },
] as const satisfies readonly AdapterEnvVariableMetadata[];

export interface OpenNodeEnv {
  /** API key from the OpenNode development or production dashboard. */
  apiKey: string;
  /**
   * Optional API base URL, e.g. `https://dev-api.opennode.com`.
   * `OpenNodeAdapter` defaults to `https://api.opennode.com` when omitted.
   */
  baseUrl?: string;
}

/**
 * Thrown when OpenNode environment validation fails. Messages never echo the
 * API key or other configured values.
 */
export class OpenNodeEnvError extends Error {
  override readonly name = "OpenNodeEnvError";
  readonly missing: readonly string[];
  readonly invalid: readonly string[];

  constructor(missing: readonly string[], invalid: readonly string[]) {
    const parts: string[] = [];
    if (missing.length > 0) {
      parts.push(`missing required env: ${missing.join(", ")}`);
    }
    if (invalid.length > 0) {
      parts.push(`invalid env (value redacted): ${invalid.join(", ")}`);
    }
    super(`Invalid OpenNode env: ${parts.join("; ")}`);
    this.missing = missing;
    this.invalid = invalid;
  }
}

/**
 * Validate and load OpenNode credentials from an env-like record.
 *
 * The matching environment variables are exported as `openNodeEnvVariables` for
 * API reference and CLI/help output.
 *
 * `OPENNODE_BASE_URL` must use HTTPS. Use `https://dev-api.opennode.com` with
 * OpenNode development-environment keys and `https://api.opennode.com` for
 * production. The returned values are trimmed; secret values are never echoed in
 * validation errors.
 *
 * @param env - Optional record of env values; defaults to `process.env`.
 * @throws {OpenNodeEnvError} when a field is missing or invalid.
 * @example
 * ```ts
 * const env = loadOpenNodeEnv();
 * const adapter = new OpenNodeAdapter(env);
 * ```
 */
export function loadOpenNodeEnv(
  env: Record<string, string | undefined> = process.env,
): OpenNodeEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const apiKey = env[OPENNODE_API_KEY_ENV];
  if (apiKey === undefined || apiKey.trim() === "") {
    missing.push(OPENNODE_API_KEY_ENV);
  }

  const baseUrl = env[OPENNODE_BASE_URL_ENV];
  if (baseUrl !== undefined && baseUrl.trim() !== "") {
    try {
      assertHttpsUrl(baseUrl);
    } catch {
      invalid.push(OPENNODE_BASE_URL_ENV);
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    throw new OpenNodeEnvError(missing, invalid);
  }

  return {
    apiKey: (apiKey as string).trim(),
    ...(baseUrl === undefined || baseUrl.trim() === "" ? {} : { baseUrl: baseUrl.trim() }),
  };
}

function assertHttpsUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("non-https");
    }
  } catch (error) {
    throw new OpenNodeApiError("invalid-request", "OpenNode base URL must be HTTPS", {
      cause: error,
    });
  }
}
