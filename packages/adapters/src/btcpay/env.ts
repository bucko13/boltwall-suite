import type { AdapterEnvVariableMetadata } from "../types";

import type { BtcPayAdapterFeatures } from "./index";

const BTCPAY_BASE_URL_ENV = "BTCPAY_BASE_URL";
const BTCPAY_API_KEY_ENV = "BTCPAY_API_KEY";
const BTCPAY_STORE_ID_ENV = "BTCPAY_STORE_ID";
const BTCPAY_CRYPTO_CODE_ENV = "BTCPAY_CRYPTO_CODE";
const BTCPAY_HODL_INVOICES_ENV = "BTCPAY_HODL_INVOICES";
const BTCPAY_STREAMING_INVOICES_ENV = "BTCPAY_STREAMING_INVOICES";

/**
 * Environment variables supported by `loadBtcPayEnv`.
 *
 * Secret variables are marked for reference output and CLIs. Boolean feature
 * assertions are validated at startup and unsupported `true` values are later
 * rejected by the adapter constructor.
 */
export const btcPayEnvVariables = [
  {
    name: BTCPAY_BASE_URL_ENV,
    required: true,
    mapsTo: "baseUrl",
    valueType: "url",
    description: "BTCPay Server origin, optionally including a reverse-proxy path prefix.",
  },
  {
    name: BTCPAY_API_KEY_ENV,
    required: true,
    mapsTo: "apiKey",
    valueType: "string",
    secret: true,
    description: "BTCPay Greenfield API key.",
  },
  {
    name: BTCPAY_STORE_ID_ENV,
    required: true,
    mapsTo: "storeId",
    valueType: "string",
    description: "BTCPay store id that owns the Lightning node configuration.",
  },
  {
    name: BTCPAY_CRYPTO_CODE_ENV,
    required: false,
    mapsTo: "cryptoCode",
    valueType: "string",
    defaultValue: "BTC",
    description: "Greenfield cryptocurrency code used in BTCPay Lightning routes.",
  },
  {
    name: BTCPAY_HODL_INVOICES_ENV,
    required: false,
    mapsTo: "features.hodlInvoices",
    valueType: "boolean",
    defaultValue: "false",
    allowedValues: ["true", "false", "1", "0"],
    description: "Deployment assertion for HODL invoice support. Current adapter rejects true.",
  },
  {
    name: BTCPAY_STREAMING_INVOICES_ENV,
    required: false,
    mapsTo: "features.streamingInvoices",
    valueType: "boolean",
    defaultValue: "false",
    allowedValues: ["true", "false", "1", "0"],
    description:
      "Deployment assertion for invoice streaming support. Current adapter rejects true.",
  },
] as const satisfies readonly AdapterEnvVariableMetadata[];

/**
 * Validated BTCPay adapter configuration loaded from environment variables.
 */
export interface BtcPayEnv {
  /** BTCPay Server origin, optionally including a reverse-proxy path prefix. */
  baseUrl: string;
  /** Greenfield API key. The adapter never includes this value in errors. */
  apiKey: string;
  /** BTCPay store id. */
  storeId: string;
  /** Greenfield cryptocurrency code, normally `BTC`. */
  cryptoCode: string;
  /**
   * Explicit adapter feature flags parsed from env. Unsupported `true` values
   * are rejected by the adapter constructor.
   */
  features: BtcPayAdapterFeatures;
}

/**
 * Thrown when BTCPay env validation fails. Secret values are never included in
 * the message.
 */
export class BtcPayEnvError extends Error {
  override readonly name = "BtcPayEnvError";
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
    super(`Invalid BTCPay env: ${parts.join("; ")}`);
    this.missing = missing;
    this.invalid = invalid;
  }
}

/**
 * Validate BTCPay Server Greenfield credentials from an env-like record.
 *
 * Supported variables are exported as `btcPayEnvVariables` for API reference
 * and CLI/help output.
 *
 * Boolean feature variables accept `true`, `false`, `1`, or `0`. Values are
 * validated at process startup and error messages never include secret values.
 *
 * @throws {BtcPayEnvError} when a required variable is missing or a value is
 *   invalid.
 * @param env - Optional env record. Defaults to `process.env`.
 * @example
 * ```ts
 * const env = loadBtcPayEnv();
 * const adapter = createBtcPayAdapter(env);
 * ```
 */
export function loadBtcPayEnv(env: Record<string, string | undefined> = process.env): BtcPayEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const baseUrl = requiredEnv(env, BTCPAY_BASE_URL_ENV, missing);
  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
    invalid.push(BTCPAY_BASE_URL_ENV);
  }

  const apiKey = requiredEnv(env, BTCPAY_API_KEY_ENV, missing);
  const storeId = requiredEnv(env, BTCPAY_STORE_ID_ENV, missing);
  const cryptoCode = optionalEnv(env, BTCPAY_CRYPTO_CODE_ENV) ?? "BTC";
  if (!/^[A-Za-z0-9]+$/.test(cryptoCode)) {
    invalid.push(BTCPAY_CRYPTO_CODE_ENV);
  }

  const hodlInvoices = parseOptionalBoolean(env, BTCPAY_HODL_INVOICES_ENV, invalid);
  const streamingInvoices = parseOptionalBoolean(env, BTCPAY_STREAMING_INVOICES_ENV, invalid);

  if (missing.length > 0 || invalid.length > 0) {
    throw new BtcPayEnvError(missing, invalid);
  }

  return {
    baseUrl: baseUrl as string,
    apiKey: apiKey as string,
    storeId: storeId as string,
    cryptoCode: cryptoCode.toUpperCase(),
    features: {
      hodlInvoices: hodlInvoices ?? false,
      streamingInvoices: streamingInvoices ?? false,
    },
  };
}

function requiredEnv(
  env: Record<string, string | undefined>,
  name: string,
  missing: string[],
): string | undefined {
  const value = optionalEnv(env, name);
  if (value === undefined) {
    missing.push(name);
  }
  return value;
}

function optionalEnv(env: Record<string, string | undefined>, name: string): string | undefined {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function parseOptionalBoolean(
  env: Record<string, string | undefined>,
  name: string,
  invalid: string[],
): boolean | undefined {
  const value = optionalEnv(env, name);
  if (value === undefined) {
    return undefined;
  }
  if (value === "true" || value === "1") {
    return true;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  invalid.push(name);
  return undefined;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
