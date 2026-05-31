import { parseAmount } from "@boltwall/internal/numeric";

import { normalizeHash32, normalizeHexString } from "../internal/hex";
import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  LightningBackend,
} from "../types";

import { loadBtcPayEnv, type BtcPayEnv } from "./env";
import {
  BtcPayAdapterError,
  BtcPayRestClient,
  type BtcPayFetch,
  type BtcPayLightningInvoiceData,
  type BtcPayRestClientOptions,
} from "./rest-client";

export {
  BtcPayAdapterError,
  type BtcPayAdapterErrorKind,
  type BtcPayFetch,
  type BtcPayLightningInvoiceData,
} from "./rest-client";
export { BtcPayEnvError, loadBtcPayEnv, type BtcPayEnv } from "./env";

const DEFAULT_CRYPTO_CODE = "BTC";

/**
 * Clock injection point used to make expiry-sensitive status mapping
 * deterministic in tests.
 */
export interface BtcPayClock {
  now(): Date;
}

/**
 * Minimal structured logger shape accepted by the BTCPay adapter.
 *
 * The adapter only logs non-secret operational metadata.
 */
export interface BtcPayLogger {
  debug?(bindings: Record<string, unknown>, message: string): void;
  info?(bindings: Record<string, unknown>, message: string): void;
  warn?(bindings: Record<string, unknown>, message: string): void;
  error?(bindings: Record<string, unknown>, message: string): void;
}

/**
 * Optional deployment feature assertions for the BTCPay adapter.
 *
 * These options are not feature toggles for hidden behavior. They let
 * deployment config fail fast if it asks for capabilities this adapter cannot
 * provide from the documented Greenfield store Lightning invoice API.
 */
export interface BtcPayAdapterFeatures {
  /**
   * Reserved for deployments with verified HODL invoice support. The current
   * Greenfield store Lightning invoice schema does not expose HODL creation.
   */
  hodlInvoices?: boolean;
  /**
   * Reserved for deployments with verified invoice streaming support. The
   * current adapter implements explicit polling lookup only.
   */
  streamingInvoices?: boolean;
}

export interface BtcPayAdapterOptions {
  /**
   * BTCPay Server origin, optionally including a reverse-proxy path prefix.
   * Credentialed deployments should use HTTPS, except for explicit localhost
   * URLs used by local test deployments.
   */
  baseUrl: string;
  /**
   * Greenfield API key. Sent as `Authorization: token <api-key>` by the REST
   * client and never logged or exposed as an adapter property.
   */
  apiKey: string;
  /** BTCPay store id that owns the Lightning node configuration. */
  storeId: string;
  /** Cryptocurrency code in the Greenfield route; defaults to `BTC`. */
  cryptoCode?: string;
  /** Explicit deployment feature flags. Unsupported `true` flags fail at boot. */
  features?: BtcPayAdapterFeatures;
  /** Fetch implementation injection for tests or custom runtimes. */
  fetch?: BtcPayFetch;
  /** Clock injection for deterministic expiry checks. */
  clock?: BtcPayClock;
  /** Optional logger. Messages are limited to non-secret metadata. */
  logger?: BtcPayLogger;
}

/**
 * Conservative BTCPay Server Greenfield adapter for store Lightning invoices.
 *
 * The adapter uses the documented Greenfield store Lightning endpoints:
 * `StoreLightningNodeApi_CreateInvoice` and `StoreLightningNodeApi_GetInvoice`
 * in the BTCPay Server Greenfield API v1 docs. The create request sends the
 * `amount` field as a millisatoshi string, and the response's opaque BTCPay
 * invoice `id` is kept in a private payment-hash index so middleware and proxy
 * callers continue to use normalized `paymentHash` lookup only.
 *
 * The adapter advertises `customDescription: true` and leaves HODL,
 * cancellation, and adapter-level invoice streaming disabled because those
 * behaviors are not available through the documented store Lightning invoice
 * endpoints. BTCPay webhooks or polling can still be handled by an application,
 * but this adapter does not expose them as `subscribeInvoices()`.
 *
 * Lookup persistence is process-local in the current implementation. If a
 * deployment needs to look up invoices after a restart, wrap this adapter or add
 * a dedicated persistence hook before relying on long-lived invoices.
 *
 * @throws {BtcPayAdapterError} when options request HODL or streaming behavior
 *   that the documented endpoint shape cannot provide.
 */
export class BtcPayAdapter implements LightningBackend {
  readonly kind: BackendKind = "btcpay";
  readonly capabilities: BackendCapabilities = {
    hodl: false,
    cancelInvoice: false,
    streamingInvoices: false,
    customDescription: true,
  };

  readonly #client: BtcPayRestClient;
  readonly #clock: BtcPayClock;
  readonly #providerIdsByPaymentHash = new Map<string, string>();

  /**
   * Build an adapter bound to one BTCPay store's Lightning node.
   *
   * Unsupported `true` feature flags are rejected here rather than at call time
   * so misconfigured deployments fail during boot.
   *
   * The API key needs BTCPay permissions to create internal-node Lightning
   * invoices and view store Lightning invoices.
   *
   * @throws {BtcPayAdapterError} when options request HODL or streaming behavior
   *   that the documented endpoint shape cannot provide.
   * @example
   * ```ts
   * const adapter = new BtcPayAdapter({
   *   baseUrl: "https://btcpay.example.com",
   *   apiKey: process.env.BTCPAY_API_KEY!,
   *   storeId: process.env.BTCPAY_STORE_ID!,
   * });
   * ```
   */
  constructor(opts: BtcPayAdapterOptions) {
    if (opts.features?.hodlInvoices === true) {
      throw new BtcPayAdapterError(
        "unsupported-feature",
        "BTCPay HODL invoices are not supported by the documented Greenfield store Lightning invoice endpoint",
      );
    }
    if (opts.features?.streamingInvoices === true) {
      throw new BtcPayAdapterError(
        "unsupported-feature",
        "BTCPay invoice streaming is not implemented by this polling adapter",
      );
    }

    const clientOptions: BtcPayRestClientOptions = {
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      storeId: opts.storeId,
      cryptoCode: opts.cryptoCode ?? DEFAULT_CRYPTO_CODE,
      ...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
    };
    this.#client = new BtcPayRestClient(clientOptions);
    this.#clock = opts.clock ?? systemClock;
    opts.logger?.debug?.({ backend: this.kind }, "BTCPay adapter initialized");
  }

  /**
   * Create a store Lightning invoice and index its opaque BTCPay id by payment
   * hash for later lookup.
   *
   * The returned amount is re-validated against the request because BTCPay echoes
   * the amount as a millisatoshi string and callers rely on the exact match.
   * `description`, when provided, is forwarded to the Greenfield create-invoice
   * request.
   *
   * @example
   * ```ts
   * const invoice = await adapter.createInvoice({ amountMsat: 1_000n });
   * console.log(invoice.paymentRequest, invoice.paymentHash);
   * ```
   */
  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    if (request.amountMsat < 0n) {
      throw new BtcPayAdapterError("invalid-request", "Invoice amount cannot be negative");
    }
    if (request.expirySeconds !== undefined && request.expirySeconds <= 0) {
      throw new BtcPayAdapterError("invalid-request", "Invoice expirySeconds must be positive");
    }
    if (request.hodl === true) {
      throw new BtcPayAdapterError(
        "unsupported-feature",
        "BTCPay HODL invoice creation is not supported by this adapter",
      );
    }

    const invoice = await this.#client.createLightningInvoice({
      amount: request.amountMsat.toString(),
      ...(request.description === undefined ? {} : { description: request.description }),
      ...(request.expirySeconds === undefined ? {} : { expiry: request.expirySeconds }),
    });
    const paymentHash = normalizePaymentHash(
      requireNonEmptyString(invoice.paymentHash, "payment hash"),
    );
    const amountMsat = parseMsat(
      requireNonEmptyString(invoice.amount, "invoice amount"),
      "invoice amount",
    );
    if (amountMsat !== request.amountMsat) {
      throw new BtcPayAdapterError(
        "invalid-response",
        "BTCPay invoice amount did not match the requested amount",
      );
    }
    this.#providerIdsByPaymentHash.set(
      paymentHash,
      requireNonEmptyString(invoice.id, "invoice id"),
    );

    return {
      paymentRequest: requireNonEmptyString(invoice.BOLT11, "BOLT11 invoice"),
      paymentHash,
      amountMsat,
      ...(invoice.expiresAt === undefined
        ? {}
        : { expiresAt: unixSecondsToDate(invoice.expiresAt) }),
    };
  }

  /**
   * Look up an invoice by payment hash via its indexed BTCPay invoice id.
   *
   * Only payment hashes returned by this adapter's `createInvoice` are known;
   * BTCPay's `GetInvoice` endpoint is keyed by opaque id, not payment hash.
   * The current provider-id index is process-local memory, so it does not
   * survive adapter reconstruction or process restart.
   *
   * @throws {BtcPayAdapterError} `not-found` when the payment hash was not
   *   created by this adapter instance.
   * @example
   * ```ts
   * const lookup = await adapter.lookupInvoice(invoice.paymentHash);
   * if (lookup.status === "settled") {
   *   // release the protected resource
   * }
   * ```
   */
  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    const normalizedHash = normalizePaymentHash(paymentHash);
    const providerId = this.#providerIdsByPaymentHash.get(normalizedHash);
    if (providerId === undefined) {
      throw new BtcPayAdapterError(
        "not-found",
        "BTCPay provider invoice id is not known for this payment hash",
      );
    }

    const invoice = await this.#client.getLightningInvoice(providerId);
    return invoiceToLookup(invoice, this.#clock);
  }
}

/**
 * Convenience: build a `BtcPayAdapter` from `process.env` using
 * `loadBtcPayEnv`. Feature flags that this adapter cannot implement are
 * rejected by the adapter constructor so unsupported deployment config fails
 * during boot.
 *
 * Reads `BTCPAY_BASE_URL`, `BTCPAY_API_KEY`, `BTCPAY_STORE_ID`, optional
 * `BTCPAY_CRYPTO_CODE`, and optional unsupported-feature assertions from the
 * supplied env record.
 *
 * @example
 * ```ts
 * // Reads BTCPAY_BASE_URL, BTCPAY_API_KEY, BTCPAY_STORE_ID from process.env.
 * const adapter = createBtcPayAdapterFromEnv();
 * ```
 */
export function createBtcPayAdapterFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: Pick<BtcPayAdapterOptions, "clock" | "fetch" | "logger">,
): BtcPayAdapter {
  const loaded = loadBtcPayEnv(env);
  return createBtcPayAdapter({
    baseUrl: loaded.baseUrl,
    apiKey: loaded.apiKey,
    storeId: loaded.storeId,
    cryptoCode: loaded.cryptoCode,
    features: loaded.features,
    ...(overrides?.clock === undefined ? {} : { clock: overrides.clock }),
    ...(overrides?.fetch === undefined ? {} : { fetch: overrides.fetch }),
    ...(overrides?.logger === undefined ? {} : { logger: overrides.logger }),
  });
}

/**
 * Build a BTCPay adapter from validated options.
 *
 * Prefer this factory over `new BtcPayAdapter(...)` so call sites depend on the
 * `LightningBackend` contract rather than the concrete class.
 *
 * @example
 * ```ts
 * const adapter = createBtcPayAdapter({
 *   baseUrl: "https://btcpay.example.com",
 *   apiKey: process.env.BTCPAY_API_KEY!,
 *   storeId: process.env.BTCPAY_STORE_ID!,
 * });
 * ```
 */
export function createBtcPayAdapter(opts: BtcPayAdapterOptions): BtcPayAdapter {
  return new BtcPayAdapter(opts);
}

function invoiceToLookup(invoice: BtcPayLightningInvoiceData, clock: BtcPayClock): InvoiceLookup {
  const status = invoiceStatus(invoice, clock);
  return {
    status,
    paymentHash: normalizePaymentHash(requireNonEmptyString(invoice.paymentHash, "payment hash")),
    amountMsat: parseMsat(
      requireNonEmptyString(invoice.amount, "invoice amount"),
      "invoice amount",
    ),
    ...(invoice.paidAt === null || invoice.paidAt === undefined
      ? {}
      : { settledAt: unixSecondsToDate(invoice.paidAt) }),
    ...(status === "settled" && invoice.preimage !== null && invoice.preimage !== undefined
      ? { preimage: normalizeHex(invoice.preimage, "preimage") }
      : {}),
  };
}

function invoiceStatus(
  invoice: Pick<BtcPayLightningInvoiceData, "status" | "expiresAt">,
  clock: BtcPayClock,
): InvoiceLookup["status"] {
  if (invoice.status === "Paid") {
    return "settled";
  }
  if (invoice.status === "Expired") {
    return "expired";
  }
  if (invoice.status === "Unpaid") {
    if (invoice.expiresAt !== undefined && unixSecondsToDate(invoice.expiresAt) <= clock.now()) {
      return "expired";
    }
    return "open";
  }
  throw new BtcPayAdapterError(
    "invalid-response",
    `Unknown BTCPay invoice status: ${invoice.status}`,
  );
}

function normalizePaymentHash(value: string): string {
  return normalizeHash32(
    value,
    () => new BtcPayAdapterError("invalid-response", "BTCPay payment-hash must be hex encoded"),
    () => new BtcPayAdapterError("invalid-response", "BTCPay payment hash must be 32 bytes"),
  );
}

function normalizeHex(value: string, label: string): string {
  return normalizeHexString(
    value,
    () => new BtcPayAdapterError("invalid-response", `BTCPay ${label} must be hex encoded`),
  );
}

function parseMsat(value: string, label: string): bigint {
  if (!/^[0-9]+$/.test(value)) {
    throw new BtcPayAdapterError(
      "invalid-response",
      `BTCPay ${label} must be a millisatoshi string`,
    );
  }
  try {
    return parseAmount(value, "msats");
  } catch {
    throw new BtcPayAdapterError(
      "invalid-response",
      `BTCPay ${label} must be a millisatoshi string`,
    );
  }
}

function unixSecondsToDate(value: number): Date {
  if (!Number.isFinite(value)) {
    throw new BtcPayAdapterError("invalid-response", "BTCPay unix timestamp is invalid");
  }
  return new Date(value * 1000);
}

function requireNonEmptyString(value: string, label: string): string {
  if (value.trim() === "") {
    throw new BtcPayAdapterError("invalid-response", `BTCPay ${label} is empty`);
  }
  return value;
}

const systemClock: BtcPayClock = {
  now() {
    return new Date();
  },
};
