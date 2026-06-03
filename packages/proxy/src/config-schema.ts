import {
  assertBackendSupports,
  type LightningBackend,
  type RequiredBackendCapabilities,
} from "@boltwall/adapters";
import { BtcPayAdapter } from "@boltwall/adapters/btcpay";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
import { parseAmount } from "@boltwall/internal/numeric";
import {
  InMemoryRootKeyStore,
  originCaveat,
  originSatisfier,
  validUntil,
  validUntilSatisfier,
} from "@boltwall/l402";
import { z } from "zod";

import type { ForwardHeadersPolicy } from "./header-policy.js";
import type { ProxyHttpMethod, ProxyRoute } from "./route-matching.js";

import type { ProxyConfig, ProxyCorsConfig } from "./index.js";

const backendKindSchema = z.enum(["lnd", "opennode", "btcpay"]);
const challengeCompatibilitySchema = z.enum(["dual", "l402-only", "lsat-only"]);
const httpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);
const corsMethodSchema = z.enum(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]);
const msatStringSchema = z
  .string()
  .regex(/^\d+$/u, "must be a non-negative integer millisatoshi amount");
const envNameSchema = z
  .string()
  .regex(/^[A-Z_][A-Z0-9_]*$/u, "must be an uppercase environment variable name");
const corsOriginSchema = z.url().transform((value) => new URL(value).origin);
const corsOriginPatternSchema = z.string().min(1).refine(isValidRegexPattern, {
  message: "must be a valid regular expression",
});
const headerNameSchema = z.string().min(1);

const backendEnvSchema = z
  .object({
    socket: envNameSchema.optional(),
    cert: envNameSchema.optional(),
    macaroon: envNameSchema.optional(),
    apiKey: envNameSchema.optional(),
    baseUrl: envNameSchema.optional(),
    storeId: envNameSchema.optional(),
    cryptoCode: envNameSchema.optional(),
    hodlInvoices: envNameSchema.optional(),
    streamingInvoices: envNameSchema.optional(),
  })
  .strict();

const routeRequirementsSchema = z
  .object({
    hodl: z.literal(true).optional(),
    cancelInvoice: z.literal(true).optional(),
    streamingInvoices: z.literal(true).optional(),
    customDescription: z.literal(true).optional(),
  })
  .strict();

const paywallPolicySchema = z
  .object({
    validUntil: z.iso.datetime().optional(),
    validUntilSeconds: z.number().int().positive().optional(),
    origin: z.array(corsOriginSchema).min(1).optional(),
    capabilities: z.array(z.string().min(1)).min(1).optional(),
    hodl: z.literal(true).optional(),
    requires: routeRequirementsSchema.optional(),
  })
  .strict();

const routeSchema = z
  .object({
    path: z.string().min(1),
    methods: z.array(httpMethodSchema).min(1).optional(),
    priceMsat: msatStringSchema.optional(),
    requires: routeRequirementsSchema.optional(),
  })
  .strict();

const configSchema = z
  .object({
    name: z.string().min(1).optional(),
    targetUrl: z.url(),
    service: z.string().min(1).optional(),
    backend: z
      .object({
        kind: backendKindSchema,
        envPrefix: envNameSchema.optional(),
        env: backendEnvSchema.optional(),
      })
      .strict(),
    pricing: z
      .object({
        defaultPriceMsat: msatStringSchema,
      })
      .strict(),
    policy: paywallPolicySchema.optional(),
    routes: z.array(routeSchema).optional(),
    challengeCompatibility: challengeCompatibilitySchema.default("dual"),
    unprotectedPaths: z.array(z.string().min(1)).optional(),
    forwardHeaders: z
      .object({
        allow: z.array(z.string().min(1)).optional(),
        deny: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    cors: z
      .object({
        allowOrigins: z.array(corsOriginSchema).min(1).optional(),
        allowOriginPatterns: z.array(corsOriginPatternSchema).min(1).optional(),
        exposeHeaders: z.array(headerNameSchema).min(1).optional(),
        allowHeaders: z.array(headerNameSchema).min(1).optional(),
        allowMethods: z.array(corsMethodSchema).min(1).optional(),
        maxAgeSeconds: z.number().int().nonnegative().optional(),
      })
      .superRefine((cors, ctx) => {
        if (cors.allowOrigins === undefined && cors.allowOriginPatterns === undefined) {
          ctx.addIssue({
            code: "custom",
            path: ["allowOrigins"],
            message: "at least one of allowOrigins or allowOriginPatterns is required",
          });
        }
      })
      .strict()
      .optional(),
    upstreamTimeoutMs: z.number().int().positive().optional(),
    deploy: z
      .object({
        target: z.literal("vercel").default("vercel"),
        projectName: z.string().min(1).optional(),
      })
      .strict()
      .default({ target: "vercel" }),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (config.policy?.capabilities !== undefined && config.service === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["service"],
        message: "service is required when policy.capabilities is configured",
      });
    }
  });

/** Backend identifiers accepted by saved Boltwall proxy config files. */
export type BoltwallBackendKind = z.infer<typeof backendKindSchema>;

/**
 * Validated saved proxy configuration.
 *
 * This is the shape returned by `parseBoltwallConfig` and loaded by the CLI
 * before it is converted into runtime `ProxyConfig`.
 */
export type BoltwallConfig = z.output<typeof configSchema>;

/** Raw input shape accepted by the saved-config validator. */
export type BoltwallConfigInput = z.input<typeof configSchema>;

/** Validated route object from a saved proxy config file. */
export type BoltwallRoute = z.output<typeof routeSchema>;

/** Backend capability requirements declared by a saved proxy route. */
export type BoltwallRouteRequirements = NonNullable<BoltwallRoute["requires"]>;

/** Global paywall policy declared by a saved proxy config file. */
export type BoltwallPaywallPolicy = NonNullable<BoltwallConfig["policy"]>;

/** Env-var name overrides declared under `backend.env` in saved config. */
export type BoltwallBackendEnv = NonNullable<BoltwallConfig["backend"]["env"]>;

/** Fully resolved environment variable names for one backend kind. */
export interface BoltwallBackendEnvNames {
  /** LND gRPC host and port. */
  socket: string;
  /** LND TLS certificate content. */
  cert: string;
  /** LND admin macaroon content. */
  macaroon: string;
  /** Provider API key. */
  apiKey: string;
  /** Provider base URL. */
  baseUrl: string;
  /** BTCPay store id. */
  storeId: string;
  /** BTCPay Greenfield cryptocurrency code. */
  cryptoCode: string;
  /** BTCPay HODL support assertion variable name. */
  hodlInvoices: string;
  /** BTCPay streaming support assertion variable name. */
  streamingInvoices: string;
}

/**
 * Thrown when saved proxy config or backend env conversion fails.
 *
 * Messages identify fields or env names, but do not include secret values.
 */
export class BoltwallConfigError extends Error {
  override readonly name = "BoltwallConfigError";
}

/**
 * Validate an unknown JSON/YAML object as saved Boltwall proxy config.
 *
 * @param input - Parsed config object from JSON, YAML, or tests.
 * @returns Normalized config with defaults applied.
 * @throws {BoltwallConfigError} when required fields are missing or invalid.
 */
export function parseBoltwallConfig(input: unknown): BoltwallConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    throw new BoltwallConfigError(formatZodError("Invalid Boltwall config", parsed.error));
  }
  return parsed.data;
}

/**
 * Convert saved config plus a live backend into runtime proxy config.
 *
 * The conversion creates an in-memory root-key store and maps saved policy
 * fields into middleware caveats, satisfiers, capabilities, and HODL mode.
 * Production deployments that need restart-safe credentials should provide a
 * different root-key store through the programmatic API.
 *
 * @param config - Validated saved config.
 * @param backend - Live Lightning backend constructed for `config.backend`.
 * @returns Runtime config accepted by `createProxy`.
 */
export function toProxyConfig(config: BoltwallConfig, backend: LightningBackend): ProxyConfig {
  return {
    targetUrl: config.targetUrl,
    backend,
    rootKeyStore: new InMemoryRootKeyStore(),
    defaultPrice: parseMsat(config.pricing.defaultPriceMsat, "pricing.defaultPriceMsat"),
    challengeCompatibility: config.challengeCompatibility,
    ...(config.service === undefined ? {} : { service: config.service }),
    ...(config.routes === undefined
      ? {}
      : { routes: toProxyRoutes(config.routes, config.pricing.defaultPriceMsat) }),
    ...(config.unprotectedPaths === undefined ? {} : { unprotectedPaths: config.unprotectedPaths }),
    ...forwardHeadersPolicy(config.forwardHeaders),
    ...(config.cors === undefined ? {} : { cors: corsPolicy(config.cors) }),
    ...(config.upstreamTimeoutMs === undefined
      ? {}
      : { upstreamTimeoutMs: config.upstreamTimeoutMs }),
    ...paywallPolicy(config.policy),
    ...globalRequirements(config),
  };
}

/**
 * Build a Lightning backend from environment variables named by saved config.
 *
 * Required env names are resolved by `backendEnvNames`. Secret values are read
 * directly from `env` and are not included in thrown error messages.
 *
 * @param config - Validated saved config containing backend kind and env-name overrides.
 * @param env - Env-like record, usually `process.env`.
 * @returns A configured LND, OpenNode, or BTCPay adapter.
 * @throws {BoltwallConfigError} when required env values are missing or invalid.
 */
export function createBackendFromEnv(
  config: BoltwallConfig,
  env: Record<string, string | undefined> = process.env,
): LightningBackend {
  const vars = backendEnvNames(config.backend.kind, config.backend.envPrefix, config.backend.env);

  if (config.backend.kind === "lnd") {
    return new LndAdapter({
      socket: requireEnv(env, vars.socket),
      cert: requireEnv(env, vars.cert),
      macaroon: requireEnv(env, vars.macaroon),
    });
  }

  if (config.backend.kind === "opennode") {
    const baseUrl = optionalEnv(env, vars.baseUrl);
    return new OpenNodeAdapter({
      apiKey: requireEnv(env, vars.apiKey),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });
  }

  return new BtcPayAdapter({
    baseUrl: requireEnv(env, vars.baseUrl),
    apiKey: requireEnv(env, vars.apiKey),
    storeId: requireEnv(env, vars.storeId),
    cryptoCode: optionalEnv(env, vars.cryptoCode) ?? "BTC",
    features: {
      hodlInvoices: optionalBoolEnv(env, vars.hodlInvoices) ?? false,
      streamingInvoices: optionalBoolEnv(env, vars.streamingInvoices) ?? false,
    },
  });
}

/**
 * Fail fast when config requires backend features the adapter cannot provide.
 *
 * Global policy requirements and route-level `requires` entries are checked
 * before serving traffic, so unsupported HODL, cancellation, streaming, or
 * description behavior fails during startup.
 *
 * @param config - Validated saved config.
 * @param backend - Backend instance to check.
 * @throws {BackendCapabilityError} from `@boltwall/adapters` when unsupported.
 */
export function validateBackendCapabilities(
  config: BoltwallConfig,
  backend: LightningBackend,
): void {
  assertBackendSupports(backend, globalRequirements(config));

  for (const route of config.routes ?? []) {
    if (route.requires !== undefined) {
      assertBackendSupports(backend, routeRequirements(route.requires));
    }
  }
}

/**
 * Resolve the environment variable names used for a backend.
 *
 * Defaults are based on backend kind and optional `envPrefix`. Explicit
 * `backend.env` overrides win for individual fields.
 *
 * @param kind - Backend kind from saved config.
 * @param envPrefix - Optional prefix such as `VOLTAGE`.
 * @param overrides - Optional per-field env names.
 * @returns Complete env-name map for all backend fields.
 * @example
 * ```ts
 * backendEnvNames("opennode").apiKey; // "OPENNODE_API_KEY"
 * backendEnvNames("lnd", "VOLTAGE").socket; // "VOLTAGE_SOCKET"
 * ```
 */
export function backendEnvNames(
  kind: BoltwallBackendKind,
  envPrefix?: string,
  overrides: BoltwallBackendEnv = {},
): BoltwallBackendEnvNames {
  if (kind === "lnd") {
    const prefix = envPrefix ?? "LND";
    return fillEnvNames(
      {
        socket: `${prefix}_SOCKET`,
        cert: `${prefix}_TLS_CERT`,
        macaroon: `${prefix}_MACAROON`,
      },
      overrides,
    );
  }

  if (kind === "opennode") {
    const prefix = envPrefix ?? "OPENNODE";
    return fillEnvNames(
      {
        apiKey: `${prefix}_API_KEY`,
        baseUrl: `${prefix}_BASE_URL`,
      },
      overrides,
    );
  }

  const prefix = envPrefix ?? "BTCPAY";
  return fillEnvNames(
    {
      baseUrl: `${prefix}_BASE_URL`,
      apiKey: `${prefix}_API_KEY`,
      storeId: `${prefix}_STORE_ID`,
      cryptoCode: `${prefix}_CRYPTO_CODE`,
      hodlInvoices: `${prefix}_HODL_INVOICES`,
      streamingInvoices: `${prefix}_STREAMING_INVOICES`,
    },
    overrides,
  );
}

/**
 * Return a short user-facing description for a backend env field.
 *
 * @param kind - Backend kind being configured.
 * @param key - Env-name map key to describe.
 * @returns Description suitable for CLI prompts and generated docs.
 */
export function backendEnvDescription(
  kind: BoltwallBackendKind,
  key: keyof BoltwallBackendEnvNames,
): string {
  if (kind === "lnd") {
    if (key === "socket") return "LND gRPC host:port";
    if (key === "cert") return "LND TLS certificate content; local regtest helper emits base64";
    if (key === "macaroon") return "LND admin macaroon content; local regtest helper emits base64";
  }

  if (kind === "opennode") {
    if (key === "apiKey") return "OpenNode API key";
    if (key === "baseUrl") return "optional OpenNode API base URL";
  }

  if (key === "baseUrl") return "BTCPay Server base URL";
  if (key === "apiKey") return "BTCPay API key";
  if (key === "storeId") return "BTCPay store ID";
  if (key === "cryptoCode") return "optional BTCPay crypto code";
  if (key === "hodlInvoices") return "optional BTCPay HODL support flag, true or false";
  if (key === "streamingInvoices")
    return "optional BTCPay streaming invoice support flag, true or false";
  return "backend environment value";
}

/**
 * List env names whose values should be treated as deployment secrets.
 *
 * The returned names are suitable for provider secret-manager prompts. Some
 * non-secret identifiers, such as BTCPay store id, are included because the
 * deployment flow provisions backend configuration as a single protected set.
 *
 * @param config - Validated saved config.
 * @returns Env names required for the selected backend.
 */
export function requiredSecretEnvNames(config: BoltwallConfig): string[] {
  const vars = backendEnvNames(config.backend.kind, config.backend.envPrefix, config.backend.env);

  if (config.backend.kind === "lnd") return [vars.socket, vars.cert, vars.macaroon];
  if (config.backend.kind === "opennode") return [vars.apiKey];
  return [vars.baseUrl, vars.apiKey, vars.storeId];
}

/**
 * Convert saved config into non-secret runtime env values for Vercel.
 *
 * Backend credentials are intentionally omitted. Use `requiredSecretEnvNames`
 * to provision provider secrets separately.
 *
 * @param config - Validated saved config.
 * @returns Plain env map used by generated Vercel project files.
 */
export function vercelRuntimeEnv(config: BoltwallConfig): Record<string, string> {
  const base: Record<string, string> = {
    TARGET_URL: config.targetUrl,
    LN_BACKEND: config.backend.kind,
    DEFAULT_PRICE_MSAT: config.pricing.defaultPriceMsat,
    CHALLENGE_COMPATIBILITY: config.challengeCompatibility,
  };

  if (config.service !== undefined) base.SERVICE = config.service;
  if (config.unprotectedPaths !== undefined)
    base.UNPROTECTED_PATHS = config.unprotectedPaths.join(",");
  if (config.forwardHeaders?.allow !== undefined) {
    base.FORWARD_ALLOW = config.forwardHeaders.allow.join(",");
  }
  if (config.forwardHeaders?.deny !== undefined) {
    base.FORWARD_DENY = config.forwardHeaders.deny.join(",");
  }
  if (config.cors !== undefined) {
    if (config.cors.allowOrigins !== undefined) {
      base.CORS_ALLOW_ORIGINS = config.cors.allowOrigins.join(",");
    }
    if (config.cors.allowOriginPatterns !== undefined) {
      base.CORS_ALLOW_ORIGIN_PATTERNS = config.cors.allowOriginPatterns.join(",");
    }
    if (config.cors.exposeHeaders !== undefined) {
      base.CORS_EXPOSE_HEADERS = config.cors.exposeHeaders.join(",");
    }
    if (config.cors.allowHeaders !== undefined) {
      base.CORS_ALLOW_HEADERS = config.cors.allowHeaders.join(",");
    }
    if (config.cors.allowMethods !== undefined) {
      base.CORS_ALLOW_METHODS = config.cors.allowMethods.join(",");
    }
    if (config.cors.maxAgeSeconds !== undefined) {
      base.CORS_MAX_AGE_SECONDS = String(config.cors.maxAgeSeconds);
    }
  }
  if (config.upstreamTimeoutMs !== undefined) {
    base.UPSTREAM_TIMEOUT_MS = String(config.upstreamTimeoutMs);
  }
  if (config.policy?.validUntil !== undefined) {
    base.POLICY_VALID_UNTIL = config.policy.validUntil;
  }
  if (config.policy?.validUntilSeconds !== undefined) {
    base.POLICY_VALID_UNTIL_SECONDS = String(config.policy.validUntilSeconds);
  }
  if (config.policy?.capabilities !== undefined) {
    base.CAPABILITIES = config.policy.capabilities.join(",");
  }
  if (config.policy?.origin !== undefined) {
    base.POLICY_ORIGIN = config.policy.origin.join(",");
  }
  if (config.policy?.hodl === true) {
    base.PAYWALL_HODL = "true";
    if (config.backend.kind === "btcpay") {
      base.BTCPAY_HODL_INVOICES = "true";
    }
  }

  return base;
}

/**
 * Build a redacted, scan-friendly summary of a saved config.
 *
 * The summary is intended for CLI confirmation output and excludes backend
 * credential values.
 *
 * @param config - Validated saved config.
 * @returns Plain object suitable for console rendering.
 */
export function configSummary(config: BoltwallConfig): Record<string, unknown> {
  return {
    name: config.name ?? "(unnamed)",
    targetUrl: config.targetUrl,
    backend: config.backend.kind,
    paywallMode: config.policy?.hodl === true ? "hodl-invoice" : "standard-invoice",
    defaultPriceMsat: config.pricing.defaultPriceMsat,
    routes: config.routes?.length ?? 0,
    challengeCompatibility: config.challengeCompatibility,
    ...(config.policy === undefined ? {} : { policy: policySummary(config.policy) }),
    cors:
      config.cors === undefined
        ? { enabled: false }
        : {
            enabled: true,
            allowOrigins: config.cors.allowOrigins ?? [],
            allowOriginPatterns: config.cors.allowOriginPatterns ?? [],
            exposeHeaders: config.cors.exposeHeaders ?? ["WWW-Authenticate"],
            allowHeaders: config.cors.allowHeaders ?? ["Authorization", "Content-Type", "Accept"],
            allowMethods: config.cors.allowMethods ?? ["GET", "HEAD", "OPTIONS"],
          },
    ...(config.deploy.projectName === undefined
      ? {}
      : { deployment: { target: config.deploy.target, projectName: config.deploy.projectName } }),
  };
}

function toProxyRoutes(routes: BoltwallRoute[], defaultPriceMsat: string): ProxyRoute[] {
  return routes.map((route) => ({
    path: route.path,
    price: parseMsat(route.priceMsat ?? defaultPriceMsat, `routes.${route.path}.priceMsat`),
    ...(route.methods === undefined ? {} : { methods: route.methods as ProxyHttpMethod[] }),
  }));
}

function forwardHeadersPolicy(
  policy: BoltwallConfig["forwardHeaders"],
): Pick<ProxyConfig, "forwardHeaders"> {
  if (policy === undefined) return {};
  const forwardHeaders: ForwardHeadersPolicy = {
    ...(policy.allow === undefined ? {} : { allow: policy.allow }),
    ...(policy.deny === undefined ? {} : { deny: policy.deny }),
  };
  return { forwardHeaders };
}

function corsPolicy(policy: NonNullable<BoltwallConfig["cors"]>): ProxyCorsConfig {
  return {
    ...(policy.allowOrigins === undefined ? {} : { allowOrigins: policy.allowOrigins }),
    ...(policy.allowOriginPatterns === undefined
      ? {}
      : { allowOriginPatterns: policy.allowOriginPatterns }),
    ...(policy.exposeHeaders === undefined ? {} : { exposeHeaders: policy.exposeHeaders }),
    ...(policy.allowHeaders === undefined ? {} : { allowHeaders: policy.allowHeaders }),
    ...(policy.allowMethods === undefined ? {} : { allowMethods: policy.allowMethods }),
    ...(policy.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: policy.maxAgeSeconds }),
  };
}

function paywallPolicy(
  policy: BoltwallConfig["policy"],
): Pick<ProxyConfig, "caveats" | "satisfiers" | "capabilities" | "hodl"> {
  if (policy === undefined) return {};

  const validUntilSeconds = policy.validUntilSeconds;
  const caveats = [
    ...(policy.validUntil === undefined ? [] : [validUntil({ iso: policy.validUntil })]),
    ...(validUntilSeconds === undefined ? [] : [() => validUntil({ seconds: validUntilSeconds })]),
    ...(policy.origin === undefined ? [] : [originCaveat(policy.origin)]),
  ];
  const satisfiers = [
    ...(policy.validUntil === undefined && validUntilSeconds === undefined
      ? []
      : [validUntilSatisfier()]),
    ...(policy.origin === undefined ? [] : [originSatisfier(policy.origin)]),
  ];

  return {
    ...(caveats.length === 0 ? {} : { caveats, satisfiers }),
    ...(policy.capabilities === undefined ? {} : { capabilities: policy.capabilities }),
    ...(policy.hodl === true ? { hodl: true as const } : {}),
  };
}

function globalRequirements(config: BoltwallConfig): RequiredBackendCapabilities {
  const requirements: RequiredBackendCapabilities = {
    ...routeRequirements(config.policy?.requires),
    ...(config.policy?.hodl === true ? { hodl: true } : {}),
  };
  for (const route of config.routes ?? []) {
    Object.assign(requirements, routeRequirements(route.requires));
  }
  return requirements;
}

function routeRequirements(
  requirements: BoltwallRouteRequirements | undefined,
): RequiredBackendCapabilities {
  return {
    ...(requirements?.hodl === true ? { hodl: true } : {}),
    ...(requirements?.cancelInvoice === true ? { cancelInvoice: true } : {}),
    ...(requirements?.streamingInvoices === true ? { streamingInvoices: true } : {}),
    ...(requirements?.customDescription === true ? { customDescription: true } : {}),
  };
}

function policySummary(policy: BoltwallPaywallPolicy): Record<string, unknown> {
  return {
    ...(policy.validUntil === undefined ? {} : { validUntil: policy.validUntil }),
    ...(policy.validUntilSeconds === undefined
      ? {}
      : { validUntilSeconds: policy.validUntilSeconds }),
    ...(policy.origin === undefined ? {} : { origin: policy.origin }),
    ...(policy.capabilities === undefined ? {} : { capabilities: policy.capabilities }),
    ...(policy.hodl === true ? { hodl: true } : {}),
    ...(policy.requires === undefined ? {} : { requirements: policy.requires }),
  };
}

function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
}

function parseMsat(value: string, label: string): bigint {
  try {
    return parseAmount(value, "msats");
  } catch {
    throw new BoltwallConfigError(`${label}: must be a non-negative integer millisatoshi amount`);
  }
}

function requireEnv(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new BoltwallConfigError(`Missing required environment variable ${name}`);
  }
  return value;
}

function optionalEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  return value === undefined || value.trim() === "" ? undefined : value;
}

function optionalBoolEnv(
  env: Record<string, string | undefined>,
  name: string,
): boolean | undefined {
  const value = optionalEnv(env, name);
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new BoltwallConfigError(`${name}: must be "true" or "false"`);
}

function fillEnvNames(
  defaults: Partial<Record<keyof BoltwallBackendEnvNames, string>>,
  overrides: BoltwallBackendEnv,
): BoltwallBackendEnvNames {
  return {
    socket: overrides.socket ?? defaults.socket ?? "UNUSED_SOCKET",
    cert: overrides.cert ?? defaults.cert ?? "UNUSED_CERT",
    macaroon: overrides.macaroon ?? defaults.macaroon ?? "UNUSED_MACAROON",
    apiKey: overrides.apiKey ?? defaults.apiKey ?? "UNUSED_API_KEY",
    baseUrl: overrides.baseUrl ?? defaults.baseUrl ?? "UNUSED_BASE_URL",
    storeId: overrides.storeId ?? defaults.storeId ?? "UNUSED_STORE_ID",
    cryptoCode: overrides.cryptoCode ?? defaults.cryptoCode ?? "UNUSED_CRYPTO_CODE",
    hodlInvoices: overrides.hodlInvoices ?? defaults.hodlInvoices ?? "UNUSED_HODL_INVOICES",
    streamingInvoices:
      overrides.streamingInvoices ?? defaults.streamingInvoices ?? "UNUSED_STREAMING_INVOICES",
  };
}

function formatZodError(prefix: string, error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ");
  return `${prefix}: ${issues}`;
}
