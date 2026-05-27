import { existsSync, readFileSync } from "node:fs";

import { parseAmount } from "@boltwall/internal/numeric";
import { originCaveat, originSatisfier, validUntil, validUntilSatisfier } from "@boltwall/l402";
import { z } from "zod";

import type { ForwardHeadersPolicy } from "./header-policy.js";

import type { ProxyConfig } from "./index.js";

const envSchema = z
  .object({
    BOLTWALL_PROXY_TARGET_URL: z.url(),
    BOLTWALL_PROXY_SERVICE: z.string().min(1).optional(),
    BOLTWALL_PROXY_DEFAULT_PRICE_MSAT: z
      .string()
      .regex(/^\d+$/u, "must be a non-negative integer millisatoshi amount")
      .optional(),
    BOLTWALL_PROXY_UNPROTECTED_PATHS: z.string().optional(),
    BOLTWALL_PROXY_FORWARD_ALLOW: z.string().optional(),
    BOLTWALL_PROXY_FORWARD_DENY: z.string().optional(),
    BOLTWALL_PROXY_CORS_ALLOW_ORIGINS: z.string().optional(),
    BOLTWALL_PROXY_CORS_EXPOSE_HEADERS: z.string().optional(),
    BOLTWALL_PROXY_CORS_ALLOW_HEADERS: z.string().optional(),
    BOLTWALL_PROXY_CORS_ALLOW_METHODS: z.string().optional(),
    BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS: z
      .string()
      .regex(/^\d+$/u, "must be a non-negative integer second duration")
      .optional(),
    BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS: z
      .string()
      .regex(/^\d+$/u, "must be a positive integer millisecond timeout")
      .refine((value) => Number(value) > 0, "must be a positive integer millisecond timeout")
      .optional(),
    BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY: z.enum(["dual", "l402-only", "lsat-only"]).optional(),
    BOLTWALL_PROXY_POLICY_VALID_UNTIL: z.iso.datetime().optional(),
    BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS: z
      .string()
      .regex(/^\d+$/u, "must be a positive integer second duration")
      .refine((value) => Number(value) > 0, "must be a positive integer second duration")
      .optional(),
    BOLTWALL_PROXY_POLICY_ORIGIN: z.string().optional(),
    BOLTWALL_PROXY_CAPABILITIES: z.string().optional(),
    BOLTWALL_PROXY_PAYWALL_HODL: z.enum(["true", "false"]).optional(),
  })
  .passthrough();

type ProxyEnvFields = z.infer<typeof envSchema>;

/** Runtime proxy configuration loaded from environment variables. */
export type ProxyEnvConfig = Pick<
  ProxyConfig,
  | "targetUrl"
  | "service"
  | "defaultPrice"
  | "unprotectedPaths"
  | "forwardHeaders"
  | "cors"
  | "upstreamTimeoutMs"
  | "challengeCompatibility"
  | "caveats"
  | "satisfiers"
  | "capabilities"
  | "hodl"
>;

/** Options for loading proxy runtime config from exported env and optional env files. */
export interface LoadProxyEnvOptions {
  /** Existing environment values. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Optional local env file path.
   *
   * Values from exported `env` override values from this file, so local files
   * are useful for development without weakening deployment configuration.
   */
  envFile?: string;
}

/** Load secret-safe proxy runtime config from exported env vars and an optional env file. */
export function loadProxyEnv(options: LoadProxyEnvOptions = {}): ProxyEnvConfig {
  const env = options.env ?? process.env;
  const merged = options.envFile === undefined ? env : { ...readEnvFile(options.envFile), ...env };
  const parsed = envSchema.safeParse(merged);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error));
  }

  return fieldsToConfig(parsed.data);
}

function fieldsToConfig(fields: ProxyEnvFields): ProxyEnvConfig {
  const forwardHeaders = parseForwardHeaders(fields);
  const cors = parseCors(fields);
  const policy = parsePolicy(fields);
  return {
    targetUrl: fields.BOLTWALL_PROXY_TARGET_URL,
    ...(fields.BOLTWALL_PROXY_SERVICE === undefined
      ? {}
      : { service: fields.BOLTWALL_PROXY_SERVICE }),
    ...(fields.BOLTWALL_PROXY_DEFAULT_PRICE_MSAT === undefined
      ? {}
      : { defaultPrice: parseAmount(fields.BOLTWALL_PROXY_DEFAULT_PRICE_MSAT, "msats") }),
    ...(fields.BOLTWALL_PROXY_UNPROTECTED_PATHS === undefined
      ? {}
      : { unprotectedPaths: splitList(fields.BOLTWALL_PROXY_UNPROTECTED_PATHS) }),
    ...(forwardHeaders === undefined ? {} : { forwardHeaders }),
    ...(cors === undefined ? {} : { cors }),
    ...(fields.BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS === undefined
      ? {}
      : { upstreamTimeoutMs: Number(fields.BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS) }),
    ...(fields.BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY === undefined
      ? {}
      : { challengeCompatibility: fields.BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY }),
    ...policy,
  };
}

function parsePolicy(
  fields: ProxyEnvFields,
): Pick<ProxyEnvConfig, "caveats" | "satisfiers" | "capabilities" | "hodl"> {
  const origin =
    fields.BOLTWALL_PROXY_POLICY_ORIGIN === undefined
      ? undefined
      : normalizeOrigins(
          splitList(fields.BOLTWALL_PROXY_POLICY_ORIGIN),
          "BOLTWALL_PROXY_POLICY_ORIGIN",
        );
  const caveats = [
    ...(fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL === undefined
      ? []
      : [validUntil({ iso: fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL })]),
    ...(fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS === undefined
      ? []
      : [
          () =>
            validUntil({
              seconds: Number(fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS),
            }),
        ]),
    ...(origin === undefined ? [] : [originCaveat(origin)]),
  ];
  const satisfiers = [
    ...(fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL === undefined &&
    fields.BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS === undefined
      ? []
      : [validUntilSatisfier()]),
    ...(origin === undefined ? [] : [originSatisfier(origin)]),
  ];

  return {
    ...(caveats.length === 0 ? {} : { caveats, satisfiers }),
    ...(fields.BOLTWALL_PROXY_CAPABILITIES === undefined
      ? {}
      : { capabilities: splitList(fields.BOLTWALL_PROXY_CAPABILITIES) }),
    ...(fields.BOLTWALL_PROXY_PAYWALL_HODL === "true" ? { hodl: true as const } : {}),
  };
}

function parseCors(fields: ProxyEnvFields): ProxyEnvConfig["cors"] | undefined {
  if (fields.BOLTWALL_PROXY_CORS_ALLOW_ORIGINS === undefined) return undefined;

  return {
    allowOrigins: normalizeOrigins(
      splitList(fields.BOLTWALL_PROXY_CORS_ALLOW_ORIGINS),
      "BOLTWALL_PROXY_CORS_ALLOW_ORIGINS",
    ),
    ...(fields.BOLTWALL_PROXY_CORS_EXPOSE_HEADERS === undefined
      ? {}
      : { exposeHeaders: splitList(fields.BOLTWALL_PROXY_CORS_EXPOSE_HEADERS) }),
    ...(fields.BOLTWALL_PROXY_CORS_ALLOW_HEADERS === undefined
      ? {}
      : { allowHeaders: splitList(fields.BOLTWALL_PROXY_CORS_ALLOW_HEADERS) }),
    ...(fields.BOLTWALL_PROXY_CORS_ALLOW_METHODS === undefined
      ? {}
      : { allowMethods: splitList(fields.BOLTWALL_PROXY_CORS_ALLOW_METHODS) }),
    ...(fields.BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS === undefined
      ? {}
      : { maxAgeSeconds: Number(fields.BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS) }),
  };
}

function normalizeOrigins(values: string[], fieldName: string): string[] {
  if (values.length === 0) {
    throw new Error(
      `Invalid Boltwall proxy environment: ${fieldName}: must contain at least one origin`,
    );
  }

  try {
    return values.map((origin) => new URL(origin).origin);
  } catch {
    throw new Error(
      `Invalid Boltwall proxy environment: ${fieldName}: must contain valid URL origins`,
    );
  }
}

function parseForwardHeaders(fields: ProxyEnvFields): ForwardHeadersPolicy | undefined {
  const allow =
    fields.BOLTWALL_PROXY_FORWARD_ALLOW === undefined
      ? undefined
      : splitList(fields.BOLTWALL_PROXY_FORWARD_ALLOW);
  const deny =
    fields.BOLTWALL_PROXY_FORWARD_DENY === undefined
      ? undefined
      : splitList(fields.BOLTWALL_PROXY_FORWARD_DENY);

  if (allow === undefined && deny === undefined) return undefined;
  return {
    ...(allow === undefined ? {} : { allow }),
    ...(deny === undefined ? {} : { deny }),
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) {
    throw new Error(`Proxy env file not found: ${path}`);
  }

  const out: Record<string, string> = {};
  const content = readFileSync(path, "utf8");
  const lines = content.split(/\r?\n/u);

  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;

    const assignment = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (assignment === null) {
      throw new Error(`Invalid proxy env file syntax at ${path}:${index + 1}`);
    }

    out[assignment[1]!] = unquoteEnvValue(assignment[2]!.trim());
  }

  return out;
}

function unquoteEnvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\n/gu, "\n").replace(/\\"/gu, '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/u, "").trim();
}

function formatEnvError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => {
      const name = issue.path.join(".") || "env";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
  return `Invalid Boltwall proxy environment: ${issues}`;
}
