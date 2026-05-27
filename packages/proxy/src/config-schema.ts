import {
  assertBackendSupports,
  type LightningBackend,
  type RequiredBackendCapabilities,
} from "@boltwall/adapters";
import { BtcPayAdapter } from "@boltwall/adapters/btcpay";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
import { createVoltageLndAdapter } from "@boltwall/adapters/voltage-lnd";
import { InMemoryRootKeyStore } from "@boltwall/l402";
import { z } from "zod";

import type { ForwardHeadersPolicy } from "./header-policy.js";
import type { ProxyHttpMethod, ProxyRoute } from "./route-matching.js";

import type { ProxyConfig, ProxyCorsConfig } from "./index.js";

const backendKindSchema = z.enum(["lnd", "voltage-lnd", "opennode", "btcpay"]);
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
        allowOrigins: z.array(corsOriginSchema).min(1),
        exposeHeaders: z.array(headerNameSchema).min(1).optional(),
        allowHeaders: z.array(headerNameSchema).min(1).optional(),
        allowMethods: z.array(corsMethodSchema).min(1).optional(),
        maxAgeSeconds: z.number().int().nonnegative().optional(),
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
  .strict();

export type BoltwallBackendKind = z.infer<typeof backendKindSchema>;
export type BoltwallConfig = z.output<typeof configSchema>;
export type BoltwallConfigInput = z.input<typeof configSchema>;
export type BoltwallRoute = z.output<typeof routeSchema>;
export type BoltwallRouteRequirements = NonNullable<BoltwallRoute["requires"]>;
export type BoltwallBackendEnv = NonNullable<BoltwallConfig["backend"]["env"]>;
export interface BoltwallBackendEnvNames {
  socket: string;
  cert: string;
  macaroon: string;
  apiKey: string;
  baseUrl: string;
  storeId: string;
  cryptoCode: string;
  hodlInvoices: string;
  streamingInvoices: string;
}

export class BoltwallConfigError extends Error {
  override readonly name = "BoltwallConfigError";
}

export function parseBoltwallConfig(input: unknown): BoltwallConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    throw new BoltwallConfigError(formatZodError("Invalid Boltwall config", parsed.error));
  }
  return parsed.data;
}

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
    ...globalRequirements(config),
  };
}

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

  if (config.backend.kind === "voltage-lnd") {
    return createVoltageLndAdapter({
      baseUrl: requireEnv(env, vars.baseUrl),
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

  if (kind === "voltage-lnd") {
    const prefix = envPrefix ?? "VOLTAGE_LND";
    return fillEnvNames(
      {
        baseUrl: `${prefix}_BASE_URL`,
        cert: `${prefix}_CERT`,
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

export function backendEnvDescription(
  kind: BoltwallBackendKind,
  key: keyof BoltwallBackendEnvNames,
): string {
  if (kind === "lnd") {
    if (key === "socket") return "LND gRPC host:port";
    if (key === "cert") return "LND TLS certificate content; local regtest helper emits base64";
    if (key === "macaroon") return "LND admin macaroon content; local regtest helper emits base64";
  }

  if (kind === "voltage-lnd") {
    if (key === "baseUrl") return "Voltage LND node URL or host";
    if (key === "cert") return "Voltage LND TLS certificate content";
    if (key === "macaroon") return "Voltage LND admin macaroon as an even-length hex string";
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

export function requiredSecretEnvNames(config: BoltwallConfig): string[] {
  const vars = backendEnvNames(config.backend.kind, config.backend.envPrefix, config.backend.env);

  if (config.backend.kind === "lnd") return [vars.socket, vars.cert, vars.macaroon];
  if (config.backend.kind === "voltage-lnd") return [vars.baseUrl, vars.macaroon, vars.cert];
  if (config.backend.kind === "opennode") return [vars.apiKey];
  return [vars.baseUrl, vars.apiKey, vars.storeId];
}

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
    base.CORS_ALLOW_ORIGINS = config.cors.allowOrigins.join(",");
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

  return base;
}

export function configSummary(config: BoltwallConfig): Record<string, unknown> {
  return {
    name: config.name ?? "(unnamed)",
    targetUrl: config.targetUrl,
    backend: config.backend.kind,
    paywallMode: "standard-invoice",
    defaultPriceMsat: config.pricing.defaultPriceMsat,
    routes: config.routes?.length ?? 0,
    challengeCompatibility: config.challengeCompatibility,
    corsOrigins: config.cors?.allowOrigins.length ?? 0,
    deployTarget: config.deploy.target,
    deployProjectName: config.deploy.projectName ?? "(unset)",
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
    allowOrigins: policy.allowOrigins,
    ...(policy.exposeHeaders === undefined ? {} : { exposeHeaders: policy.exposeHeaders }),
    ...(policy.allowHeaders === undefined ? {} : { allowHeaders: policy.allowHeaders }),
    ...(policy.allowMethods === undefined ? {} : { allowMethods: policy.allowMethods }),
    ...(policy.maxAgeSeconds === undefined ? {} : { maxAgeSeconds: policy.maxAgeSeconds }),
  };
}

function globalRequirements(config: BoltwallConfig): RequiredBackendCapabilities {
  const requirements: RequiredBackendCapabilities = {};
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

function parseMsat(value: string, label: string): bigint {
  try {
    return BigInt(value);
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
