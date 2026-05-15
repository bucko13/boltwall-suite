import { LndAdapter, type LndAdapterOptions, type LndApi } from "../lnd";

import { loadVoltageLndEnv, VoltageLndEnvError, type VoltageLndEnv } from "./env";

export { loadVoltageLndEnv, VoltageLndEnvError, type VoltageLndEnv };

/**
 * Default Voltage LND gRPC port.
 *
 * Documented at https://docs.voltage.cloud/lnd-node-api ("gRPC port 10009").
 * Voltage also exposes REST on port 8080; the `lightning` package and the
 * underlying `LndAdapter` use gRPC, so the gRPC port is the relevant default.
 */
export const VOLTAGE_LND_GRPC_PORT = 10009;

/**
 * Construction options for a Voltage-hosted `LndAdapter`.
 */
export interface VoltageLndAdapterOptions {
  /**
   * Voltage-issued URL or host for the node. Accepts any of:
   * - bare host: `node-name.m.voltageapp.io`
   * - host with port: `node-name.m.voltageapp.io:10009`
   * - full URL: `https://node-name.m.voltageapp.io` or `https://node-name.m.voltageapp.io:8080`
   *
   * The factory normalizes all forms to a gRPC `host:port` socket. The path,
   * query, fragment, and scheme are discarded; the REST port (8080) is
   * replaced with the gRPC port (10009) because the underlying `LndAdapter`
   * speaks gRPC. Override the port by supplying it explicitly with the host.
   */
  baseUrl: string;
  /** Admin macaroon as a lowercase hex string. */
  macaroon: string;
  /** TLS certificate in base64 (no PEM headers) or full PEM. */
  cert: string;
  /**
   * Override hook for the underlying `lightning` API surface, used in unit
   * tests to inject a mocked gRPC client. Omit in production code; the
   * default `lightning`-package implementation is used automatically.
   */
  api?: LndApi;
}

/**
 * Build an `LndAdapter` configured for a Voltage Cloud hosted LND node.
 *
 * Voltage exposes the full LND gRPC API per
 * https://docs.voltage.cloud/lnd-node-api, so the returned adapter inherits
 * `LndAdapter` behavior and capabilities unchanged. This factory only
 * normalizes the Voltage-flavored connection string into the underlying
 * gRPC socket form expected by the `lightning` package.
 *
 * @throws {LndAdapterError} when the underlying client fails to initialize
 *   (re-thrown from `LndAdapter`).
 * @throws {RangeError} when `baseUrl` cannot be parsed.
 */
export function createVoltageLndAdapter(opts: VoltageLndAdapterOptions): LndAdapter {
  const socket = normalizeBaseUrl(opts.baseUrl);
  const lndOptions: LndAdapterOptions = {
    socket,
    cert: opts.cert,
    macaroon: opts.macaroon,
  };
  return opts.api === undefined ? new LndAdapter(lndOptions) : new LndAdapter(lndOptions, opts.api);
}

/**
 * Convenience: build a `createVoltageLndAdapter`-ready options bundle from
 * `process.env` using `loadVoltageLndEnv`.
 */
export function createVoltageLndAdapterFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: Pick<VoltageLndAdapterOptions, "api">,
): LndAdapter {
  const loaded = loadVoltageLndEnv(env);
  return createVoltageLndAdapter({
    baseUrl: loaded.baseUrl,
    macaroon: loaded.macaroon,
    cert: loaded.cert,
    ...(overrides?.api === undefined ? {} : { api: overrides.api }),
  });
}

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new RangeError("Voltage LND baseUrl is empty");
  }

  let host: string;
  let port: number | null = null;

  if (trimmed.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch (cause) {
      throw new RangeError(`Voltage LND baseUrl is not a valid URL: ${trimmed}`, { cause });
    }
    host = parsed.hostname;
    if (parsed.port !== "") {
      port = Number(parsed.port);
    }
  } else {
    const colon = trimmed.indexOf(":");
    if (colon === -1) {
      host = trimmed;
    } else {
      host = trimmed.slice(0, colon);
      const portStr = trimmed.slice(colon + 1);
      const parsedPort = Number(portStr);
      if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        throw new RangeError(`Voltage LND baseUrl has invalid port: ${portStr}`);
      }
      port = parsedPort;
    }
  }

  if (host === "") {
    throw new RangeError(`Voltage LND baseUrl is missing a host: ${trimmed}`);
  }

  // Voltage's documented REST port (8080) cannot serve gRPC. Substitute the
  // gRPC port silently because the underlying `LndAdapter` is gRPC-only and
  // the most common user mistake is pasting the REST URL from the dashboard.
  if (port === null || port === 8080) {
    port = VOLTAGE_LND_GRPC_PORT;
  }

  return `${host}:${port}`;
}
