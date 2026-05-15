import { OpenNodeApiError } from "./rest-client";

export interface OpenNodeEnv {
  /** API key from the OpenNode development or production dashboard. */
  apiKey: string;
  /** Optional API base URL, e.g. `https://dev-api.opennode.com`. */
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
 * The matching environment variables are:
 * - `OPENNODE_API_KEY`
 * - `OPENNODE_BASE_URL` (optional; defaults in `OpenNodeAdapter`)
 *
 * `OPENNODE_BASE_URL` must use HTTPS. Use `https://dev-api.opennode.com` with
 * OpenNode development-environment keys and `https://api.opennode.com` for
 * production.
 *
 * @param env - Optional record of env values; defaults to `process.env`.
 * @throws {OpenNodeEnvError} when a field is missing or invalid.
 */
export function loadOpenNodeEnv(
  env: Record<string, string | undefined> = process.env,
): OpenNodeEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const apiKey = env.OPENNODE_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    missing.push("OPENNODE_API_KEY");
  }

  const baseUrl = env.OPENNODE_BASE_URL;
  if (baseUrl !== undefined && baseUrl.trim() !== "") {
    try {
      assertHttpsUrl(baseUrl);
    } catch {
      invalid.push("OPENNODE_BASE_URL");
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
