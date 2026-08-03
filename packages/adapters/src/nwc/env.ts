import type { AdapterEnvVariableMetadata } from "../types";

const NWC_CONNECTION_STRING_ENV = "NWC_CONNECTION_STRING";

/**
 * Environment variables supported by `loadNwcEnv`.
 *
 * The connection string is a bearer credential because it carries the NWC
 * secret that authorizes wallet requests. CLIs and docs may show this metadata,
 * but must never echo the value.
 */
export const nwcEnvVariables = [
  {
    name: NWC_CONNECTION_STRING_ENV,
    required: true,
    mapsTo: "nostrWalletConnectUrl",
    valueType: "string",
    secret: true,
    description:
      "Nostr Wallet Connect connection string from Alby Hub or another NWC wallet service.",
  },
] as const satisfies readonly AdapterEnvVariableMetadata[];

export interface NwcEnv {
  /** NWC connection string, e.g. `nostr+walletconnect://...`. */
  nostrWalletConnectUrl: string;
}

/**
 * Thrown when NWC environment validation fails. Messages never echo the
 * connection string.
 */
export class NwcEnvError extends Error {
  override readonly name = "NwcEnvError";
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
    super(`Invalid NWC env: ${parts.join("; ")}`);
    this.missing = missing;
    this.invalid = invalid;
  }
}

/**
 * Validate and load NWC credentials from an env-like record.
 *
 * @param env - Optional record of env values; defaults to `process.env`.
 * @throws {NwcEnvError} when the connection string is missing or malformed.
 * @example
 * ```ts
 * const env = loadNwcEnv();
 * const adapter = new NwcAdapter(env);
 * ```
 */
export function loadNwcEnv(env: Record<string, string | undefined> = process.env): NwcEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const url = env[NWC_CONNECTION_STRING_ENV];
  if (url === undefined || url.trim() === "") {
    missing.push(NWC_CONNECTION_STRING_ENV);
  } else {
    try {
      assertNwcUrl(url);
    } catch {
      invalid.push(NWC_CONNECTION_STRING_ENV);
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    throw new NwcEnvError(missing, invalid);
  }

  return { nostrWalletConnectUrl: (url as string).trim() };
}

function assertNwcUrl(value: string): void {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "nostr+walletconnect:") {
    throw new Error("invalid-nwc-url");
  }
  if (parsed.hostname.trim() === "") {
    throw new Error("missing-wallet-pubkey");
  }
  const secret = parsed.searchParams.get("secret");
  if (secret === null || secret.trim() === "") {
    throw new Error("missing-secret");
  }
  if (!parsed.searchParams.has("relay")) {
    throw new Error("missing-relay");
  }
}
