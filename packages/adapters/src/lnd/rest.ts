import { normalizeHash32 } from "../internal/hex";
import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  InvoiceStatus,
  LightningBackend,
} from "../types";

import {
  type LndInvoice,
  LndRestApiError,
  type LndRestApiErrorKind,
  LndRestClient,
  type LndRestClientOptions,
  type LndRestTransport,
} from "./rest-client";

/**
 * Credentials and endpoint for an LND node's REST API.
 *
 * Unlike the gRPC {@link LndAdapter}, this carries no `lightning` dependency, so
 * it loads on runtimes that cannot bundle `tiny-secp256k1`'s wasm or a CommonJS
 * `require` (notably Vercel's serverless functions).
 */
export interface LndRestAdapterOptions {
  /**
   * REST base URL for the node, e.g. `https://node.voltageapp.io:8080`. Voltage
   * exposes REST on port 8080; this is distinct from the gRPC `socket` (10009).
   */
  baseUrl: string;
  /**
   * Macaroon content, hex or base64. The local regtest helper and `LND_MACAROON`
   * export base64; it is converted to hex for the `Grpc-Metadata-macaroon` header.
   */
  macaroon: string;
  /**
   * PEM TLS certificate for the node, trusted as the CA for its self-signed REST
   * endpoint. Omit only when the node presents a publicly trusted certificate.
   */
  cert?: string;
  /** Injected transport for tests; defaults to a `node:https` implementation. */
  transport?: LndRestTransport;
}

/** Stable classification for {@link LndRestAdapterError}. */
export type LndRestAdapterErrorKind = LndRestApiErrorKind;

/**
 * Error thrown by {@link LndRestAdapter} when LND rejects a request or a
 * response cannot be normalized.
 */
export class LndRestAdapterError extends Error {
  readonly kind: LndRestAdapterErrorKind;
  override readonly cause: unknown;

  constructor(kind: LndRestAdapterErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "LndRestAdapterError";
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * Server-side LND backend over the node's REST API using plain HTTPS.
 *
 * This adapter implements the invoice operations an L402 paywall needs —
 * creating an invoice for the payment challenge and looking up its settlement
 * state — without gRPC. It is the backend the generated Vercel deploy uses for
 * LND, because the gRPC {@link LndAdapter} pulls in `lightning` →
 * `tiny-secp256k1` (wasm) → a dynamic `require("crypto")`, none of which load on
 * the serverless function runtime.
 *
 * HODL invoices, cancellation, and streaming are not exposed here (LND's REST
 * API supports them through separate endpoints; add them if a deployment needs
 * those capabilities). The capability flags below reflect that honestly so
 * `assertBackendSupports` rejects an unsupported configuration at boot.
 *
 * @example
 * ```ts
 * const adapter = new LndRestAdapter({
 *   baseUrl: process.env.LND_REST_HOST!,
 *   macaroon: process.env.LND_MACAROON!,
 *   cert: process.env.LND_TLS_CERT!,
 * });
 * const invoice = await adapter.createInvoice({ amountMsat: 1_000n });
 * ```
 */
export class LndRestAdapter implements LightningBackend {
  readonly kind: BackendKind = "lnd";
  readonly capabilities: BackendCapabilities = {
    hodl: false,
    cancelInvoice: false,
    streamingInvoices: false,
    customDescription: true,
  };

  readonly #client: LndRestClient;

  /**
   * Build an adapter for one LND node's REST endpoint.
   *
   * Unlike the gRPC adapter, no connection is opened at construction time; the
   * first request validates credentials and reachability.
   *
   * @throws {LndRestAdapterError} when `baseUrl` is not an absolute HTTPS URL.
   * @example
   * ```ts
   * const adapter = new LndRestAdapter({
   *   baseUrl: "https://node.voltageapp.io:8080",
   *   macaroon: process.env.LND_MACAROON!,
   *   cert: process.env.LND_TLS_CERT!,
   * });
   * ```
   */
  constructor(opts: LndRestAdapterOptions) {
    const clientOptions: LndRestClientOptions = {
      baseUrl: opts.baseUrl,
      macaroonHex: toMacaroonHex(opts.macaroon),
      ...(opts.cert === undefined ? {} : { cert: opts.cert }),
      ...(opts.transport === undefined ? {} : { transport: opts.transport }),
    };
    try {
      this.#client = new LndRestClient(clientOptions);
    } catch (error) {
      throw normalizeError(error, "Failed to initialize LND REST client");
    }
  }

  /**
   * Create a standard BOLT 11 invoice on the node.
   *
   * @throws {LndRestAdapterError} `invalid-request` on a negative amount or
   *   non-positive expiry; otherwise the classified REST error.
   * @example
   * ```ts
   * const invoice = await adapter.createInvoice({ amountMsat: 1_000n, description: "Pokedex" });
   * ```
   */
  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    if (request.hodl === true) {
      throw new LndRestAdapterError(
        "invalid-request",
        "LndRestAdapter does not support HODL invoices",
      );
    }
    if (request.amountMsat < 0n) {
      throw new LndRestAdapterError("invalid-request", "Invoice amount cannot be negative");
    }
    if (request.expirySeconds !== undefined && request.expirySeconds <= 0) {
      throw new LndRestAdapterError("invalid-request", "Invoice expirySeconds must be positive");
    }

    const body: Record<string, unknown> = {
      value_msat: request.amountMsat.toString(),
      ...(request.description === undefined ? {} : { memo: request.description }),
      ...(request.expirySeconds === undefined ? {} : { expiry: request.expirySeconds.toString() }),
    };

    let response;
    try {
      response = await this.#client.addInvoice(body);
    } catch (error) {
      throw normalizeError(error, "LND REST failed to create invoice");
    }

    const paymentRequest = requireString(response.payment_request, "payment_request");
    return {
      paymentRequest,
      paymentHash: paymentHashFromBase64(response.r_hash),
      amountMsat: request.amountMsat,
      ...(request.expirySeconds === undefined
        ? {}
        : { expiresAt: new Date(Date.now() + request.expirySeconds * 1000) }),
    };
  }

  /**
   * Look up an invoice on the node by its hex payment hash.
   *
   * @throws {LndRestAdapterError} `not-found` when the node has no such invoice.
   * @example
   * ```ts
   * const lookup = await adapter.lookupInvoice(invoice.paymentHash);
   * ```
   */
  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    const hashHex = normalizePaymentHash(paymentHash);
    let invoice: LndInvoice;
    try {
      invoice = await this.#client.lookupInvoice(hashHex);
    } catch (error) {
      throw normalizeError(error, "LND REST failed to look up invoice");
    }
    return invoiceToLookup(invoice, hashHex);
  }
}

function invoiceToLookup(invoice: LndInvoice, fallbackHashHex: string): InvoiceLookup {
  const status = invoiceStatus(invoice);
  const paymentHash =
    invoice.r_hash === undefined || invoice.r_hash === ""
      ? fallbackHashHex
      : paymentHashFromBase64(invoice.r_hash);
  const msat = amountMsat(invoice);
  return {
    status,
    paymentHash,
    ...(msat === undefined ? {} : { amountMsat: msat }),
    ...(status === "settled" ? settledFields(invoice) : {}),
  };
}

function settledFields(invoice: LndInvoice): Partial<InvoiceLookup> {
  return {
    ...(typeof invoice.settle_date === "string" && invoice.settle_date !== "0"
      ? { settledAt: new Date(Number(invoice.settle_date) * 1000) }
      : {}),
    ...(invoice.r_preimage === undefined || invoice.r_preimage === ""
      ? {}
      : { preimage: base64ToHex(requireString(invoice.r_preimage, "r_preimage")) }),
  };
}

function invoiceStatus(invoice: LndInvoice): InvoiceStatus {
  const state = typeof invoice.state === "string" ? invoice.state.toUpperCase() : undefined;
  if (state === "SETTLED" || invoice.settled === true) {
    return "settled";
  }
  if (state === "CANCELED") {
    return "canceled";
  }
  if (state === "ACCEPTED") {
    return "held";
  }
  if (isExpired(invoice)) {
    return "expired";
  }
  return "open";
}

function isExpired(invoice: LndInvoice): boolean {
  if (typeof invoice.creation_date !== "string" || typeof invoice.expiry !== "string") {
    return false;
  }
  const expiresAtMs = (Number(invoice.creation_date) + Number(invoice.expiry)) * 1000;
  return Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();
}

function amountMsat(invoice: LndInvoice): bigint | undefined {
  if (typeof invoice.value_msat === "string" && invoice.value_msat !== "") {
    return BigInt(invoice.value_msat);
  }
  if (typeof invoice.value === "string" && invoice.value !== "") {
    return BigInt(invoice.value) * 1000n;
  }
  return undefined;
}

function paymentHashFromBase64(value: unknown): string {
  const hex = base64ToHex(requireString(value, "r_hash"));
  return normalizePaymentHash(hex);
}

function normalizePaymentHash(value: string): string {
  return normalizeHash32(
    value,
    () => new LndRestAdapterError("invalid-request", "payment-hash must be hex encoded"),
    () => new LndRestAdapterError("invalid-request", "Payment hash must be 32 bytes"),
  );
}

/**
 * LND's REST API encodes byte fields (`r_hash`, `r_preimage`) as base64, but the
 * Boltwall contract uses lowercase hex throughout. URL-safe base64 is tolerated
 * because some LND builds emit it for byte fields.
 */
function base64ToHex(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("hex");
}

/**
 * Accept a macaroon as hex or base64 and return hex for the auth header.
 *
 * `LND_MACAROON` is conventionally base64; an already-hex value (only `0-9a-f`,
 * even length) is passed through so callers may supply either encoding.
 */
function toMacaroonHex(macaroon: string): string {
  const trimmed = macaroon.trim();
  if (trimmed === "") {
    throw new LndRestAdapterError("invalid-request", "macaroon is required");
  }
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return trimmed.toLowerCase();
  }
  return Buffer.from(trimmed, "base64").toString("hex");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new LndRestAdapterError(
      "lnd-error",
      `LND REST response is missing the ${field} field`,
    );
  }
  return value;
}

function normalizeError(error: unknown, message: string): LndRestAdapterError {
  if (error instanceof LndRestAdapterError) {
    return error;
  }
  if (error instanceof LndRestApiError) {
    return new LndRestAdapterError(error.kind, `${message}: ${error.message}`, error);
  }
  return new LndRestAdapterError(
    "lnd-error",
    `${message}: ${error instanceof Error ? error.message : String(error)}`,
    error,
  );
}
