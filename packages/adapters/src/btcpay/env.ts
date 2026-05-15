import type { BtcPayAdapterFeatures } from "./index";

/**
 * Validated BTCPay adapter configuration loaded from environment variables.
 */
export interface BtcPayEnv {
  /** BTCPay Server origin. */
  baseUrl: string;
  /** Greenfield API key. */
  apiKey: string;
  /** BTCPay store id. */
  storeId: string;
  /** Greenfield cryptocurrency code, normally `BTC`. */
  cryptoCode: string;
  /** Explicit adapter feature flags parsed from env. */
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
 * Required variables:
 * - `BTCPAY_BASE_URL`
 * - `BTCPAY_API_KEY`
 * - `BTCPAY_STORE_ID`
 *
 * Optional variables:
 * - `BTCPAY_CRYPTO_CODE` defaults to `BTC`
 * - `BTCPAY_HODL_INVOICES` defaults to `false`
 * - `BTCPAY_STREAMING_INVOICES` defaults to `false`
 *
 * Values are validated at process startup and error messages never include
 * secret values.
 */
export function loadBtcPayEnv(env: Record<string, string | undefined> = process.env): BtcPayEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const baseUrl = requiredEnv(env, "BTCPAY_BASE_URL", missing);
  if (baseUrl !== undefined && !isHttpUrl(baseUrl)) {
    invalid.push("BTCPAY_BASE_URL");
  }

  const apiKey = requiredEnv(env, "BTCPAY_API_KEY", missing);
  const storeId = requiredEnv(env, "BTCPAY_STORE_ID", missing);
  const cryptoCode = optionalEnv(env, "BTCPAY_CRYPTO_CODE") ?? "BTC";
  if (!/^[A-Za-z0-9]+$/.test(cryptoCode)) {
    invalid.push("BTCPAY_CRYPTO_CODE");
  }

  const hodlInvoices = parseOptionalBoolean(env, "BTCPAY_HODL_INVOICES", invalid);
  const streamingInvoices = parseOptionalBoolean(env, "BTCPAY_STREAMING_INVOICES", invalid);

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
