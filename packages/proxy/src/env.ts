import { existsSync, readFileSync } from "node:fs";

import { parseAmount } from "@boltwall/internal/numeric";
import { originCaveat, originSatisfier, validUntil, validUntilSatisfier } from "@boltwall/l402";
import { z } from "zod";

import type { ForwardHeadersPolicy } from "./header-policy.js";

import type { ProxyConfig } from "./index.js";

/**
 * Parser category used by `loadProxyEnv` for an environment variable.
 *
 * Generated API docs use this value to describe the supported syntax without
 * repeating the private Zod schema.
 */
export type ProxyEnvValueKind =
  | "url"
  | "string"
  | "nonnegative-integer-msat"
  | "comma-list"
  | "nonnegative-integer-seconds"
  | "positive-integer-milliseconds"
  | "challenge-compatibility"
  | "iso-datetime"
  | "positive-integer-seconds"
  | "boolean";

/**
 * Public metadata for one `BOLTWALL_PROXY_*` environment variable.
 *
 * This metadata is the source for `loadProxyEnv` validation, CLI help, and
 * public reference material. Secret-bearing backend credentials, root keys,
 * macaroons, bearer tokens, TLS certs, and preimages are intentionally outside
 * this proxy-runtime config surface.
 */
export interface ProxyEnvVariableMetadata {
  /** Environment variable name consumed by `loadProxyEnv`. */
  readonly name: string;
  /** Whether `loadProxyEnv` requires this variable when no env file supplies it. */
  readonly required: boolean;
  /** Parser category and accepted value shape. */
  readonly valueKind: ProxyEnvValueKind;
  /** `ProxyEnvConfig` field populated by this variable. */
  readonly configPath: string;
  /** Short description shown in help output and reference material. */
  readonly description: string;
  /** Default value or behavior when the variable is omitted. */
  readonly defaultValue?: string;
  /** Separator for list-like values. */
  readonly listSeparator?: ",";
  /** Accepted string values for enum-like variables. */
  readonly allowedValues?: readonly string[];
}

const proxyEnvVariableDefinitions = [
  {
    name: "BOLTWALL_PROXY_TARGET_URL",
    required: true,
    valueKind: "url",
    configPath: "targetUrl",
    description: "HTTPS upstream origin protected by the proxy.",
    schema: z.url(),
  },
  {
    name: "BOLTWALL_PROXY_SERVICE",
    required: false,
    valueKind: "string",
    configPath: "service",
    description: "Optional service name for minted macaroon caveats.",
    schema: z.string().min(1).optional(),
  },
  {
    name: "BOLTWALL_PROXY_DEFAULT_PRICE_MSAT",
    required: false,
    valueKind: "nonnegative-integer-msat",
    configPath: "defaultPrice",
    description: "Default protected-route price in millisatoshis.",
    schema: z
      .string()
      .regex(/^\d+$/u, "must be a non-negative integer millisatoshi amount")
      .optional(),
  },
  {
    name: "BOLTWALL_PROXY_UNPROTECTED_PATHS",
    required: false,
    valueKind: "comma-list",
    configPath: "unprotectedPaths",
    description: "Comma-separated path patterns that bypass L402 authorization.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_FORWARD_ALLOW",
    required: false,
    valueKind: "comma-list",
    configPath: "forwardHeaders.allow",
    description: "Comma-separated request-header allow patterns forwarded upstream.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_FORWARD_DENY",
    required: false,
    valueKind: "comma-list",
    configPath: "forwardHeaders.deny",
    description:
      "Comma-separated request-header deny patterns stripped before upstream forwarding.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CORS_ALLOW_ORIGINS",
    required: false,
    valueKind: "comma-list",
    configPath: "cors.allowOrigins",
    description: "Comma-separated browser origins allowed to read proxy responses.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CORS_EXPOSE_HEADERS",
    required: false,
    valueKind: "comma-list",
    configPath: "cors.exposeHeaders",
    description: "Comma-separated response headers exposed to browser JavaScript.",
    defaultValue: "WWW-Authenticate",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CORS_ALLOW_HEADERS",
    required: false,
    valueKind: "comma-list",
    configPath: "cors.allowHeaders",
    description: "Comma-separated request headers allowed on CORS preflight.",
    defaultValue: "Authorization,Content-Type,Accept",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CORS_ALLOW_METHODS",
    required: false,
    valueKind: "comma-list",
    configPath: "cors.allowMethods",
    description: "Comma-separated HTTP methods allowed on CORS preflight.",
    defaultValue: "GET,HEAD,OPTIONS",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS",
    required: false,
    valueKind: "nonnegative-integer-seconds",
    configPath: "cors.maxAgeSeconds",
    description: "Optional Access-Control-Max-Age value in seconds.",
    schema: z.string().regex(/^\d+$/u, "must be a non-negative integer second duration").optional(),
  },
  {
    name: "BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS",
    required: false,
    valueKind: "positive-integer-milliseconds",
    configPath: "upstreamTimeoutMs",
    description: "Positive upstream proxy timeout in milliseconds.",
    schema: z
      .string()
      .regex(/^\d+$/u, "must be a positive integer millisecond timeout")
      .refine((value) => Number(value) > 0, "must be a positive integer millisecond timeout")
      .optional(),
  },
  {
    name: "BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY",
    required: false,
    valueKind: "challenge-compatibility",
    configPath: "challengeCompatibility",
    description: "Challenge emission mode delegated to @boltwall/middleware.",
    defaultValue: "dual",
    allowedValues: ["dual", "l402-only", "lsat-only"],
    schema: z.enum(["dual", "l402-only", "lsat-only"]).optional(),
  },
  {
    name: "BOLTWALL_PROXY_POLICY_VALID_UNTIL",
    required: false,
    valueKind: "iso-datetime",
    configPath: "caveats",
    description: "Absolute valid-until caveat timestamp.",
    schema: z.iso.datetime().optional(),
  },
  {
    name: "BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS",
    required: false,
    valueKind: "positive-integer-seconds",
    configPath: "caveats",
    description: "Relative valid-until caveat duration in seconds.",
    schema: z
      .string()
      .regex(/^\d+$/u, "must be a positive integer second duration")
      .refine((value) => Number(value) > 0, "must be a positive integer second duration")
      .optional(),
  },
  {
    name: "BOLTWALL_PROXY_POLICY_ORIGIN",
    required: false,
    valueKind: "comma-list",
    configPath: "caveats",
    description: "Comma-separated request origins for origin caveats and satisfiers.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_CAPABILITIES",
    required: false,
    valueKind: "comma-list",
    configPath: "capabilities",
    description: "Comma-separated macaroon capabilities; requires BOLTWALL_PROXY_SERVICE.",
    listSeparator: ",",
    schema: z.string().optional(),
  },
  {
    name: "BOLTWALL_PROXY_PAYWALL_HODL",
    required: false,
    valueKind: "boolean",
    configPath: "hodl",
    description: "Enable HODL-invoice middleware mode.",
    defaultValue: "false",
    allowedValues: ["true", "false"],
    schema: z.enum(["true", "false"]).optional(),
  },
] as const;

/**
 * Supported `BOLTWALL_PROXY_*` variables consumed by `loadProxyEnv`.
 *
 * The array is exported for CLI help, public reference material, and tests. It
 * is derived from the same definitions that build the runtime validator.
 */
export const proxyEnvVariables = proxyEnvVariableDefinitions.map(
  ({ schema: _schema, ...metadata }) => metadata,
) satisfies readonly ProxyEnvVariableMetadata[];

export type ProxyEnvVariableName = (typeof proxyEnvVariables)[number]["name"];

type ProxyEnvFields = Partial<Record<ProxyEnvVariableName, string>> & {
  BOLTWALL_PROXY_TARGET_URL: string;
};

const envSchema = z.object(buildEnvSchemaShape()).passthrough();

function buildEnvSchemaShape(): Record<ProxyEnvVariableName, z.ZodType> {
  return Object.fromEntries(
    proxyEnvVariableDefinitions.map((definition) => [definition.name, definition.schema]),
  ) as unknown as Record<ProxyEnvVariableName, z.ZodType>;
}

/**
 * Runtime proxy configuration loaded from environment variables.
 *
 * This is the environment-driven subset of {@link ProxyConfig}. It omits the
 * live Lightning backend and `rootKeyStore`; callers provide those explicitly
 * so secret-bearing dependencies stay outside config files.
 */
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

/**
 * Load secret-safe proxy runtime config from exported env vars and an optional env file.
 *
 * The returned config omits the live backend and root-key store, so spread it
 * into {@link ProxyConfig} alongside those constructed dependencies. Exported
 * environment variables override `envFile` values.
 *
 * Validation errors name the missing or malformed variable without echoing
 * secret values. Comma-separated fields are trimmed and empty entries are
 * ignored. Origins are normalized to URL origins, and capability caveats require
 * a service name.
 *
 * @example
 * ```ts
 * import { createProxy, loadProxyEnv } from "@boltwall/proxy";
 * import { InMemoryRootKeyStore } from "@boltwall/l402";
 * import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
 *
 * const envConfig = loadProxyEnv({ envFile: ".env.local" });
 * const app = createProxy({
 *   ...envConfig,
 *   backend: new OpenNodeAdapter({ apiKey: process.env.OPENNODE_API_KEY! }),
 *   rootKeyStore: new InMemoryRootKeyStore(),
 * });
 * ```
 */
export function loadProxyEnv(options: LoadProxyEnvOptions = {}): ProxyEnvConfig {
  const env = options.env ?? process.env;
  const merged = options.envFile === undefined ? env : { ...readEnvFile(options.envFile), ...env };
  const parsed = envSchema.safeParse(merged);

  if (!parsed.success) {
    throw new Error(formatEnvError(parsed.error));
  }

  return fieldsToConfig(parsed.data as ProxyEnvFields);
}

function fieldsToConfig(fields: ProxyEnvFields): ProxyEnvConfig {
  if (
    fields.BOLTWALL_PROXY_CAPABILITIES !== undefined &&
    fields.BOLTWALL_PROXY_SERVICE === undefined
  ) {
    throw new Error("BOLTWALL_PROXY_SERVICE is required when BOLTWALL_PROXY_CAPABILITIES is set");
  }
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
      : {
          challengeCompatibility:
            fields.BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY as ProxyEnvConfig["challengeCompatibility"],
        }),
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
