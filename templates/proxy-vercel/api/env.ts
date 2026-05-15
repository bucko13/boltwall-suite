import type { LightningBackend } from "@boltwall/adapters";
import { BtcPayAdapter } from "@boltwall/adapters/btcpay";
import { LndAdapter } from "@boltwall/adapters/lnd";
import { OpenNodeAdapter } from "@boltwall/adapters/opennode";
import { createVoltageLndAdapter } from "@boltwall/adapters/voltage-lnd";
import type { ProxyEnvConfig } from "@boltwall/proxy";
import { z } from "zod";

const backendSchema = z.enum(["lnd", "voltage-lnd", "opennode", "btcpay"]);
const challengeCompatibilitySchema = z.enum(["dual", "l402-only", "lsat-only"]);
const boolFlagSchema = z.enum(["true", "false"]).transform((value) => value === "true");

const baseEnvSchema = z
  .object({
    TARGET_URL: z.url(),
    LN_BACKEND: backendSchema,
    SERVICE: z.string().min(1).optional(),
    DEFAULT_PRICE_MSAT: z
      .string()
      .regex(/^\d+$/u, "must be a non-negative integer millisatoshi amount")
      .default("1000"),
    CHALLENGE_COMPATIBILITY: challengeCompatibilitySchema.default("dual"),
    UNPROTECTED_PATHS: z.string().optional(),
    FORWARD_ALLOW: z.string().optional(),
    FORWARD_DENY: z.string().optional(),
    UPSTREAM_TIMEOUT_MS: z
      .string()
      .regex(/^\d+$/u, "must be a positive integer millisecond timeout")
      .refine((value) => Number(value) > 0, "must be a positive integer millisecond timeout")
      .optional(),
  })
  .passthrough();

const lndEnvSchema = z.object({
  LND_SOCKET: z.string().min(1),
  LND_TLS_CERT: z.string().min(1),
  LND_MACAROON: z.string().min(1),
});

const voltageLndEnvSchema = z.object({
  VOLTAGE_LND_BASE_URL: z.string().min(1),
  VOLTAGE_LND_MACAROON: z
    .string()
    .regex(/^[0-9a-fA-F]+$/u, "must be a hex string")
    .refine((value) => value.length % 2 === 0, "must contain an even number of hex characters"),
  VOLTAGE_LND_CERT: z.string().min(1),
});

const openNodeEnvSchema = z.object({
  OPENNODE_API_KEY: z.string().min(1),
  OPENNODE_BASE_URL: z.url().optional(),
});

const btcPayEnvSchema = z.object({
  BTCPAY_BASE_URL: z.url(),
  BTCPAY_API_KEY: z.string().min(1),
  BTCPAY_STORE_ID: z.string().min(1),
  BTCPAY_CRYPTO_CODE: z.string().min(1).default("BTC"),
  BTCPAY_HODL_INVOICES: boolFlagSchema.default(false),
  BTCPAY_STREAMING_INVOICES: boolFlagSchema.default(false),
});

type BackendKind = z.infer<typeof backendSchema>;

export type BoltwallBackendConfig =
  | {
      kind: "lnd";
      socket: string;
      cert: string;
      macaroon: string;
    }
  | {
      kind: "voltage-lnd";
      baseUrl: string;
      macaroon: string;
      cert: string;
    }
  | {
      kind: "opennode";
      apiKey: string;
      baseUrl?: string;
    }
  | {
      kind: "btcpay";
      baseUrl: string;
      apiKey: string;
      storeId: string;
      cryptoCode: string;
      features: {
        hodlInvoices: boolean;
        streamingInvoices: boolean;
      };
    };

export interface BoltwallTemplateEnv {
  proxy: ProxyEnvConfig;
  backend: BoltwallBackendConfig;
}

export class BoltwallTemplateEnvError extends Error {
  override readonly name = "BoltwallTemplateEnvError";
}

export function loadBoltwallEnv(
  env: Record<string, string | undefined> = process.env,
): BoltwallTemplateEnv {
  const base = parseEnv(baseEnvSchema, env);
  const backend = loadBackendEnv(base.LN_BACKEND, env);
  const proxy: ProxyEnvConfig = {
    targetUrl: base.TARGET_URL,
    defaultPrice: BigInt(base.DEFAULT_PRICE_MSAT),
    challengeCompatibility: base.CHALLENGE_COMPATIBILITY,
    ...(base.SERVICE === undefined ? {} : { service: base.SERVICE }),
    ...(base.UNPROTECTED_PATHS === undefined
      ? {}
      : { unprotectedPaths: splitList(base.UNPROTECTED_PATHS) }),
    ...(base.UPSTREAM_TIMEOUT_MS === undefined
      ? {}
      : { upstreamTimeoutMs: Number(base.UPSTREAM_TIMEOUT_MS) }),
    ...forwardHeaders(base),
  };

  return { proxy, backend };
}

export function createBackend(config: BoltwallBackendConfig): LightningBackend {
  if (config.kind === "lnd") {
    return new LndAdapter({
      socket: config.socket,
      cert: config.cert,
      macaroon: config.macaroon,
    });
  }

  if (config.kind === "voltage-lnd") {
    return createVoltageLndAdapter({
      baseUrl: config.baseUrl,
      cert: config.cert,
      macaroon: config.macaroon,
    });
  }

  if (config.kind === "opennode") {
    return new OpenNodeAdapter({
      apiKey: config.apiKey,
      ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
    });
  }

  return new BtcPayAdapter({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    storeId: config.storeId,
    cryptoCode: config.cryptoCode,
    features: config.features,
  });
}

function loadBackendEnv(
  kind: BackendKind,
  env: Record<string, string | undefined>,
): BoltwallBackendConfig {
  if (kind === "lnd") {
    const fields = parseEnv(lndEnvSchema, env);
    return {
      kind,
      socket: fields.LND_SOCKET,
      cert: fields.LND_TLS_CERT,
      macaroon: fields.LND_MACAROON,
    };
  }

  if (kind === "voltage-lnd") {
    const fields = parseEnv(voltageLndEnvSchema, env);
    return {
      kind,
      baseUrl: fields.VOLTAGE_LND_BASE_URL,
      cert: fields.VOLTAGE_LND_CERT,
      macaroon: fields.VOLTAGE_LND_MACAROON,
    };
  }

  if (kind === "opennode") {
    const fields = parseEnv(openNodeEnvSchema, env);
    return {
      kind,
      apiKey: fields.OPENNODE_API_KEY,
      ...(fields.OPENNODE_BASE_URL === undefined ? {} : { baseUrl: fields.OPENNODE_BASE_URL }),
    };
  }

  const fields = parseEnv(btcPayEnvSchema, env);
  return {
    kind,
    baseUrl: fields.BTCPAY_BASE_URL,
    apiKey: fields.BTCPAY_API_KEY,
    storeId: fields.BTCPAY_STORE_ID,
    cryptoCode: fields.BTCPAY_CRYPTO_CODE,
    features: {
      hodlInvoices: fields.BTCPAY_HODL_INVOICES,
      streamingInvoices: fields.BTCPAY_STREAMING_INVOICES,
    },
  };
}

function parseEnv<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined>,
): z.output<T> {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new BoltwallTemplateEnvError(formatEnvError(parsed.error));
  }
  return parsed.data;
}

function forwardHeaders(
  base: z.output<typeof baseEnvSchema>,
): Pick<ProxyEnvConfig, "forwardHeaders"> {
  const allow = base.FORWARD_ALLOW === undefined ? undefined : splitList(base.FORWARD_ALLOW);
  const deny = base.FORWARD_DENY === undefined ? undefined : splitList(base.FORWARD_DENY);

  if (allow === undefined && deny === undefined) return {};
  return {
    forwardHeaders: {
      ...(allow === undefined ? {} : { allow }),
      ...(deny === undefined ? {} : { deny }),
    },
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function formatEnvError(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => {
      const name = issue.path.join(".") || "env";
      return `${name}: ${issue.message}`;
    })
    .join("; ");
  return `Invalid Boltwall Vercel template environment: ${issues}`;
}
