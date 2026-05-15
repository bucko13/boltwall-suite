/**
 * Typed loader for Voltage LND environment configuration.
 *
 * Voltage Cloud exposes the full LND gRPC + REST surface against a per-node
 * base URL. See:
 * - https://docs.voltage.cloud/lnd-node-api (gRPC port 10009, REST port 8080,
 *   admin macaroon and TLS cert provided in the dashboard)
 * - https://docs.voltage.cloud/rest-api-examples (URL template
 *   `https://<node-name>.m.voltageapp.io:8080`, macaroon as hex string in
 *   the `grpc-metadata-macaroon` header)
 *
 * The schema is intentionally a small typed loader rather than a `zod`
 * dependency: `@boltwall/adapters` has zero runtime deps today and the
 * project's dependency policy prefers internal helpers when ~200 lines is
 * enough. Validation is performed at process startup and errors are
 * deliberately written without echoing secret values.
 */

/**
 * Fields read from `process.env` when wiring a Voltage LND adapter.
 *
 * The matching environment variables are:
 * - `VOLTAGE_LND_BASE_URL`
 * - `VOLTAGE_LND_MACAROON`
 * - `VOLTAGE_LND_CERT`
 *
 * Pass an explicit `env` record to override `process.env` in tests.
 */
export interface VoltageLndEnv {
  /** Voltage-provided base URL or host (e.g. `https://node.m.voltageapp.io` or `node.m.voltageapp.io`). */
  baseUrl: string;
  /** Admin macaroon as a lowercase hex string. */
  macaroon: string;
  /** TLS certificate in base64 (no PEM headers) or full PEM. */
  cert: string;
}

/**
 * Thrown when env validation fails. Messages never include secret values.
 */
export class VoltageLndEnvError extends Error {
  override readonly name = "VoltageLndEnvError";
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
    super(`Invalid Voltage LND env: ${parts.join("; ")}`);
    this.missing = missing;
    this.invalid = invalid;
  }
}

/**
 * Validate and load Voltage LND credentials from an env-like record.
 *
 * Validation rules:
 * - `VOLTAGE_LND_BASE_URL` must be a non-empty string.
 * - `VOLTAGE_LND_MACAROON` must be a non-empty hex string (`/^[0-9a-fA-F]+$/`)
 *   with an even length. The `lightning` package accepts hex macaroons.
 * - `VOLTAGE_LND_CERT` must be a non-empty string; both raw base64 and full
 *   PEM-with-headers forms are accepted because the `lightning` package
 *   normalizes both.
 *
 * @param env - Optional record of env values; defaults to `process.env`.
 * @throws {VoltageLndEnvError} when any field is missing or invalid.
 */
export function loadVoltageLndEnv(env: Record<string, string | undefined> = process.env): VoltageLndEnv {
  const missing: string[] = [];
  const invalid: string[] = [];

  const baseUrl = env.VOLTAGE_LND_BASE_URL;
  if (baseUrl === undefined || baseUrl.trim() === "") {
    missing.push("VOLTAGE_LND_BASE_URL");
  }

  const macaroon = env.VOLTAGE_LND_MACAROON;
  if (macaroon === undefined || macaroon === "") {
    missing.push("VOLTAGE_LND_MACAROON");
  } else if (!isHexString(macaroon)) {
    invalid.push("VOLTAGE_LND_MACAROON");
  }

  const cert = env.VOLTAGE_LND_CERT;
  if (cert === undefined || cert.trim() === "") {
    missing.push("VOLTAGE_LND_CERT");
  }

  if (missing.length > 0 || invalid.length > 0) {
    throw new VoltageLndEnvError(missing, invalid);
  }

  return {
    baseUrl: (baseUrl as string).trim(),
    macaroon: macaroon as string,
    cert: (cert as string).trim(),
  };
}

function isHexString(value: string): boolean {
  return value.length > 0 && value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}
