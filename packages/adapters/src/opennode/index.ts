import { msatsToSats, satsToMsats } from "@boltwall/internal/numeric";
import { decodeBolt11Invoice } from "@boltwall/l402";

import { normalizeHash32 } from "../internal/hex";
import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  LightningBackend,
} from "../types";

import { loadOpenNodeEnv, OpenNodeEnvError } from "./env";
import { OpenNodeRestClient, type OpenNodeCharge, type OpenNodeFetch } from "./rest-client";

export { loadOpenNodeEnv, OpenNodeEnvError, type OpenNodeEnv } from "./env";
export { OpenNodeApiError, type OpenNodeFetch } from "./rest-client";

const OPENNODE_DEFAULT_BASE_URL = "https://api.opennode.com";
const OPENNODE_MIN_TTL_MINUTES = 10;
const OPENNODE_MAX_TTL_MINUTES = 4_320;

export interface OpenNodeInvoiceDecoderResult {
  paymentHashHex: string;
  amountMsat: bigint;
  expiresAt: Date;
}

export type OpenNodeInvoiceDecoder = (paymentRequest: string) => OpenNodeInvoiceDecoderResult;

/**
 * Store that keeps OpenNode's opaque charge ID hidden behind the normalized
 * `paymentHash` lookup API.
 *
 * The default implementation is process-local memory. Long-running production
 * deployments that need invoice lookup across restarts should inject a
 * persistent store.
 */
export interface OpenNodeChargeStore {
  get(paymentHash: string): Promise<string | undefined> | string | undefined;
  set(paymentHash: string, chargeId: string): Promise<void> | void;
}

/**
 * Minimal logger shape accepted by the OpenNode adapter. The adapter currently
 * does not log by default; this type documents the required secret-redaction
 * boundary for future instrumentation.
 */
export interface SecretRedactingLogger {
  debug?(fields: Record<string, unknown>, message: string): void;
  info?(fields: Record<string, unknown>, message: string): void;
  warn?(fields: Record<string, unknown>, message: string): void;
  error?(fields: Record<string, unknown>, message: string): void;
}

export interface Clock {
  now(): Date;
}

export interface OpenNodeAdapterFeatures {
  /**
   * Reserved for deployments with verified HODL invoice support. OpenNode's
   * documented charge lifecycle does not expose HODL/preimage settlement.
   */
  hodlInvoices?: boolean;
  /**
   * Reserved for deployments with verified invoice streaming support. The
   * current adapter implements explicit polling lookup only.
   */
  streamingInvoices?: boolean;
}

export interface OpenNodeAdapterOptions {
  /** OpenNode API key. Stored privately and never exposed on the adapter. */
  apiKey: string;
  /**
   * OpenNode API base URL. Defaults to production. Use
   * `https://dev-api.opennode.com` with development-mode keys.
   */
  baseUrl?: string;
  /** Injected fetch implementation for tests and custom runtimes. */
  fetch?: OpenNodeFetch;
  /** Optional persistent mapping from Boltwall payment hash to OpenNode charge ID. */
  chargeStore?: OpenNodeChargeStore;
  /** Optional BOLT 11 decoder. Defaults to `@boltwall/l402`'s public decoder. */
  decodeInvoice?: OpenNodeInvoiceDecoder;
  /** Reserved for future timestamp-aware behavior; present for shared adapter symmetry. */
  clock?: Clock;
  /** Reserved for future redacted operational logging. */
  logger?: SecretRedactingLogger;
  /** Explicit deployment feature flags. Unsupported `true` flags fail at boot. */
  features?: OpenNodeAdapterFeatures;
}

export type OpenNodeAdapterErrorKind =
  | "invalid-request"
  | "invalid-response"
  | "not-found"
  | "unsupported-feature"
  | "opennode-error";

export class OpenNodeAdapterError extends Error {
  readonly kind: OpenNodeAdapterErrorKind;
  override readonly cause: unknown;

  constructor(kind: OpenNodeAdapterErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "OpenNodeAdapterError";
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * Server-side OpenNode Lightning backend adapter.
 *
 * Official OpenNode docs verified for this implementation:
 * - Authentication: https://developers.opennode.com/docs/authorization
 * - Development environments: https://developers.opennode.com/docs/environments
 * - Create charge: https://developers.opennode.com/reference/create-charge
 * - Charge info: https://developers.opennode.com/reference/charge-info
 * - Charge lifecycle: https://developers.opennode.com/docs/charge-lifecycle
 * - Charge webhooks: https://developers.opennode.com/docs/charges-webhooks
 */
export class OpenNodeAdapter implements LightningBackend {
  readonly kind: BackendKind = "opennode";
  readonly capabilities: BackendCapabilities = {
    hodl: false,
    cancelInvoice: false,
    streamingInvoices: false,
    customDescription: true,
  };

  readonly #client: OpenNodeRestClient;
  readonly #chargeStore: OpenNodeChargeStore;
  readonly #decodeInvoice: OpenNodeInvoiceDecoder;

  /**
   * Build an adapter for one OpenNode account.
   *
   * Unsupported `true` feature flags are rejected here so misconfigured
   * deployments fail during boot rather than on the first paid request.
   *
   * @throws {OpenNodeAdapterError} when `apiKey` is empty or when HODL/streaming
   *   features are requested.
   * @example
   * ```ts
   * const adapter = new OpenNodeAdapter({ apiKey: process.env.OPENNODE_API_KEY! });
   * ```
   */
  constructor(opts: OpenNodeAdapterOptions) {
    if (opts.apiKey.trim() === "") {
      throw new OpenNodeAdapterError("invalid-request", "OpenNode apiKey is required");
    }
    if (opts.features?.hodlInvoices === true) {
      throw new OpenNodeAdapterError(
        "unsupported-feature",
        "OpenNode HODL invoices are not supported by the documented charge lifecycle",
      );
    }
    if (opts.features?.streamingInvoices === true) {
      throw new OpenNodeAdapterError(
        "unsupported-feature",
        "OpenNode invoice streaming is not implemented by this polling adapter",
      );
    }

    this.#client = new OpenNodeRestClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? OPENNODE_DEFAULT_BASE_URL,
      ...(opts.fetch === undefined ? {} : { fetch: opts.fetch }),
    });
    this.#chargeStore = opts.chargeStore ?? new MemoryOpenNodeChargeStore();
    this.#decodeInvoice = opts.decodeInvoice ?? defaultDecodeInvoice;
  }

  /**
   * Create an OpenNode charge and return its Lightning invoice.
   *
   * The BOLT 11 invoice is decoded locally to recover the payment hash and
   * amount, which are then validated against the request because OpenNode keys
   * charges by an opaque id rather than payment hash.
   *
   * @example
   * ```ts
   * const invoice = await adapter.createInvoice({ amountMsat: 1_000_000n });
   * ```
   */
  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    if (request.hodl === true) {
      throw new OpenNodeAdapterError(
        "unsupported-feature",
        "OpenNode does not support HODL invoices",
      );
    }

    const charge = await this.#client.createCharge(createChargeBody(request));
    const payreq = extractPaymentRequest(charge);
    const decoded = decodeOpenNodeInvoice(this.#decodeInvoice, payreq);
    const paymentHash = normalizePaymentHash(decoded.paymentHashHex);
    validateCreatedAmount(request.amountMsat, decoded.amountMsat);

    await this.#chargeStore.set(paymentHash, requireChargeId(charge));

    return {
      paymentRequest: payreq,
      paymentHash,
      amountMsat: request.amountMsat,
      expiresAt: chargeExpiresAt(charge) ?? decoded.expiresAt,
    };
  }

  /**
   * Look up an invoice by payment hash via its stored OpenNode charge id.
   *
   * Only payment hashes created by this adapter (and persisted in the charge
   * store) are resolvable, since OpenNode's charge-info endpoint is keyed by id.
   *
   * @throws {OpenNodeAdapterError} `not-found` when no charge id is stored for
   *   the payment hash.
   * @example
   * ```ts
   * const lookup = await adapter.lookupInvoice(invoice.paymentHash);
   * ```
   */
  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    const normalizedHash = normalizePaymentHash(paymentHash);
    const chargeId = await this.#chargeStore.get(normalizedHash);
    if (chargeId === undefined) {
      throw new OpenNodeAdapterError(
        "not-found",
        "OpenNode charge id is not available for payment hash",
      );
    }

    const charge = await this.#client.getCharge(chargeId);
    const result: InvoiceLookup = {
      status: mapOpenNodeStatus(charge.status),
      paymentHash: normalizedHash,
    };
    const amountMsat = chargeAmountMsat(charge);
    if (amountMsat !== undefined) {
      result.amountMsat = amountMsat;
    }
    return result;
  }
}

/**
 * Create an OpenNode adapter from an env-like record.
 *
 * Reads `OPENNODE_API_KEY` and optional `OPENNODE_BASE_URL`. The default base
 * URL is production; set `OPENNODE_BASE_URL=https://dev-api.opennode.com` when
 * using OpenNode development-environment keys.
 *
 * @example
 * ```ts
 * // Reads OPENNODE_API_KEY (and optional OPENNODE_BASE_URL) from process.env.
 * const adapter = createOpenNodeAdapterFromEnv();
 * ```
 */
export function createOpenNodeAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
  opts: Omit<OpenNodeAdapterOptions, "apiKey" | "baseUrl"> = {},
): OpenNodeAdapter {
  const loaded = loadOpenNodeEnv(env);
  return new OpenNodeAdapter({ ...opts, ...loaded });
}

class MemoryOpenNodeChargeStore implements OpenNodeChargeStore {
  readonly #chargeIdsByPaymentHash = new Map<string, string>();

  get(paymentHash: string): string | undefined {
    return this.#chargeIdsByPaymentHash.get(paymentHash);
  }

  set(paymentHash: string, chargeId: string): void {
    this.#chargeIdsByPaymentHash.set(paymentHash, chargeId);
  }
}

function defaultDecodeInvoice(paymentRequest: string): OpenNodeInvoiceDecoderResult {
  return decodeBolt11Invoice(paymentRequest);
}

function createChargeBody(request: CreateInvoiceRequest): Record<string, unknown> {
  if (request.amountMsat <= 0n) {
    throw new OpenNodeAdapterError("invalid-request", "Invoice amount must be positive");
  }
  const amount = msatsToSats(request.amountMsat);
  if (amount.msatRemainder !== 0n) {
    throw new OpenNodeAdapterError(
      "invalid-request",
      "OpenNode invoice amount must be an integer number of satoshis",
    );
  }

  if (amount.sats > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new OpenNodeAdapterError("invalid-request", "OpenNode invoice amount is too large");
  }

  const body: Record<string, unknown> = {
    amount: Number(amount.sats),
  };
  if (request.description !== undefined) {
    body.description = request.description;
  }
  if (request.expirySeconds !== undefined) {
    body.ttl = expirySecondsToTtlMinutes(request.expirySeconds);
  }
  const orderId = request.metadata?.order_id ?? request.metadata?.orderId;
  if (orderId !== undefined) {
    body.order_id = orderId;
  }
  return body;
}

function expirySecondsToTtlMinutes(expirySeconds: number): number {
  if (!Number.isInteger(expirySeconds) || expirySeconds <= 0) {
    throw new OpenNodeAdapterError(
      "invalid-request",
      "Invoice expirySeconds must be a positive integer",
    );
  }
  const ttl = Math.ceil(expirySeconds / 60);
  if (ttl < OPENNODE_MIN_TTL_MINUTES || ttl > OPENNODE_MAX_TTL_MINUTES) {
    throw new OpenNodeAdapterError(
      "invalid-request",
      `OpenNode ttl must be between ${OPENNODE_MIN_TTL_MINUTES} and ${OPENNODE_MAX_TTL_MINUTES} minutes`,
    );
  }
  return ttl;
}

function extractPaymentRequest(charge: OpenNodeCharge): string {
  const payreq = charge.lightning_invoice?.payreq;
  if (typeof payreq !== "string" || payreq.trim() === "") {
    throw new OpenNodeAdapterError(
      "invalid-response",
      "OpenNode charge response did not include a Lightning invoice",
    );
  }
  return payreq;
}

function decodeOpenNodeInvoice(
  decodeInvoice: OpenNodeInvoiceDecoder,
  paymentRequest: string,
): OpenNodeInvoiceDecoderResult {
  try {
    return decodeInvoice(paymentRequest);
  } catch (error) {
    throw new OpenNodeAdapterError(
      "invalid-response",
      "OpenNode returned an invalid Lightning invoice",
      error,
    );
  }
}

function validateCreatedAmount(requested: bigint, decoded: bigint): void {
  if (decoded !== 0n && decoded !== requested) {
    throw new OpenNodeAdapterError(
      "invalid-response",
      "OpenNode Lightning invoice amount did not match the requested amount",
    );
  }
}

function requireChargeId(charge: OpenNodeCharge): string {
  if (typeof charge.id !== "string" || charge.id.trim() === "") {
    throw new OpenNodeAdapterError(
      "invalid-response",
      "OpenNode charge response did not include a charge id",
    );
  }
  return charge.id;
}

function normalizePaymentHash(value: string): string {
  const notHash32 = (): OpenNodeAdapterError =>
    new OpenNodeAdapterError("invalid-response", "Payment hash must be a 32-byte hex string");
  return normalizeHash32(value, notHash32, notHash32);
}

function chargeExpiresAt(charge: OpenNodeCharge): Date | undefined {
  const expiresAt = charge.lightning_invoice?.expires_at;
  if (typeof expiresAt !== "number") {
    return undefined;
  }
  return new Date(expiresAt * 1000);
}

function chargeAmountMsat(charge: OpenNodeCharge): bigint | undefined {
  if (typeof charge.amount !== "number" || !Number.isFinite(charge.amount)) {
    return undefined;
  }
  if (!Number.isSafeInteger(charge.amount) || charge.amount < 0) {
    throw new OpenNodeAdapterError(
      "invalid-response",
      "OpenNode charge amount must be a non-negative safe integer number of satoshis",
    );
  }
  return satsToMsats(BigInt(charge.amount));
}

function mapOpenNodeStatus(status: string | undefined): InvoiceLookup["status"] {
  switch (status) {
    case "paid":
      return "settled";
    case "expired":
      return "expired";
    case "refunded":
      return "canceled";
    case "unpaid":
    case "processing":
    case "underpaid":
    case undefined:
      return "open";
    default:
      return "open";
  }
}
