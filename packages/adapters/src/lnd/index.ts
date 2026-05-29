import type { EventEmitter } from "node:events";

import {
  authenticatedLndGrpc,
  cancelHodlInvoice,
  createHodlInvoice,
  createInvoice,
  getInvoice,
  settleHodlInvoice,
  subscribeToInvoices,
} from "lightning";
import type {
  AuthenticatedLnd,
  CreateHodlInvoiceResult,
  CreateInvoiceResult,
  GetInvoiceResult,
  SubscribeToInvoicesInvoiceUpdatedEvent,
} from "lightning";

import { normalizeHash32, normalizeHexString } from "../internal/hex";
import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  InvoiceStatus,
  LightningBackend,
} from "../types";

export interface LndAdapterOptions {
  /** LND gRPC socket, for example `127.0.0.1:10009`. */
  socket: string;
  /**
   * TLS certificate content. The local regtest helper exports this as
   * `LND_TLS_CERT` with base64 content; PEM content may also be accepted by the
   * underlying `lightning` package. Filesystem paths should use path-named
   * variables such as `LND_TLS_CERT_PATH` before being read into this field.
   */
  cert: string;
  /**
   * Admin macaroon content. The local regtest helper exports this as
   * `LND_MACAROON` with base64 content.
   */
  macaroon: string;
}

export type LndAdapterErrorKind =
  | "connection-refused"
  | "unauthorized"
  | "not-found"
  | "invalid-request"
  | "lnd-error";

export class LndAdapterError extends Error {
  readonly kind: LndAdapterErrorKind;
  override readonly cause: unknown;

  constructor(kind: LndAdapterErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "LndAdapterError";
    this.kind = kind;
    this.cause = cause;
  }
}

/**
 * Injection point for the `lightning` package gRPC client surface.
 *
 * Exposed for unit tests that need to substitute the gRPC client. Production callers should
 * not pass an `LndApi`; the default `lightning`-package implementation is
 * used when the second `LndAdapter` constructor argument is omitted.
 */
export interface LndApi {
  authenticatedLndGrpc(auth: LndAdapterOptions): { lnd: AuthenticatedLnd };
  createInvoice(args: {
    lnd: AuthenticatedLnd;
    mtokens: string;
    description?: string;
    expires_at?: string;
  }): Promise<CreateInvoiceResult>;
  createHodlInvoice(args: {
    lnd: AuthenticatedLnd;
    id: string;
    mtokens: string;
    description?: string;
    expires_at?: string;
  }): Promise<CreateHodlInvoiceResult>;
  getInvoice(args: { lnd: AuthenticatedLnd; id: string }): Promise<GetInvoiceResult>;
  cancelHodlInvoice(args: { lnd: AuthenticatedLnd; id: string }): Promise<void>;
  settleHodlInvoice(args: { lnd: AuthenticatedLnd; secret: string }): Promise<void>;
  subscribeToInvoices(args: { lnd: AuthenticatedLnd }): EventEmitter;
}

type HtlcInvoice = GetInvoiceResult & { is_held?: boolean };

const defaultLndApi: LndApi = {
  authenticatedLndGrpc,
  cancelHodlInvoice,
  createHodlInvoice,
  createInvoice,
  getInvoice,
  settleHodlInvoice,
  subscribeToInvoices,
};

export class LndAdapter implements LightningBackend {
  readonly kind: BackendKind = "lnd";
  readonly capabilities: BackendCapabilities = {
    hodl: true,
    cancelInvoice: true,
    streamingInvoices: true,
    customDescription: true,
  };

  readonly #api: LndApi;
  readonly #lnd: AuthenticatedLnd;

  /**
   * Open an authenticated gRPC client to an LND node.
   *
   * The gRPC client is created eagerly so credential or connection problems
   * surface at construction time. The second `api` argument is a test seam; omit
   * it in production to use the `lightning` package implementation.
   *
   * @param opts - Socket, TLS cert, and admin macaroon for the node.
   * @throws {LndAdapterError} when the authenticated client cannot be created.
   * @example
   * ```ts
   * const adapter = new LndAdapter({
   *   socket: process.env.LND_SOCKET!,
   *   cert: process.env.LND_TLS_CERT!,
   *   macaroon: process.env.LND_MACAROON!,
   * });
   * ```
   */
  constructor(opts: LndAdapterOptions);
  constructor(opts: LndAdapterOptions, api: LndApi);
  constructor(opts: LndAdapterOptions, api: LndApi = defaultLndApi) {
    this.#api = api;
    try {
      this.#lnd = api.authenticatedLndGrpc(opts).lnd;
    } catch (error) {
      throw normalizeLndError(error, "Failed to initialize authenticated LND client");
    }
  }

  /**
   * Create a standard or HODL invoice on the node.
   *
   * A HODL invoice requires a caller-supplied `paymentHash`; LND derives a
   * standard invoice's hash itself, so passing one there has no effect.
   *
   * @throws {LndAdapterError} `invalid-request` when a HODL invoice is requested
   *   without a payment hash, or on negative amounts / non-positive expiry.
   * @example
   * ```ts
   * const invoice = await adapter.createInvoice({ amountMsat: 1_000n });
   * ```
   */
  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    const args = this.#createInvoiceArgs(request);
    try {
      const invoice =
        request.hodl === true
          ? await this.#api.createHodlInvoice({
              ...args,
              id: normalizePaymentHash(
                request.paymentHash ?? fail("lnd-hodl-payment-hash-required"),
              ),
            })
          : await this.#api.createInvoice(args);

      return {
        paymentRequest: invoice.request,
        paymentHash: normalizePaymentHash(invoice.id),
        amountMsat: parseMsat(invoice.mtokens, invoice.tokens),
        ...(args.expires_at === undefined ? {} : { expiresAt: new Date(args.expires_at) }),
      };
    } catch (error) {
      throw normalizeLndError(error, "LND failed to create invoice");
    }
  }

  /**
   * Look up an invoice on the node by its payment hash.
   *
   * @throws {LndAdapterError} `not-found` when the node has no such invoice.
   * @example
   * ```ts
   * const lookup = await adapter.lookupInvoice(invoice.paymentHash);
   * ```
   */
  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    try {
      const invoice = await this.#api.getInvoice({
        lnd: this.#lnd,
        id: normalizePaymentHash(paymentHash),
      });
      return invoiceToLookup(invoice);
    } catch (error) {
      throw normalizeLndError(error, "LND failed to look up invoice");
    }
  }

  /**
   * Cancel an invoice, returning any accepted HODL HTLCs to the payer.
   *
   * LND uses the same cancel RPC for standard and HODL invoices; an already
   * settled invoice cannot be canceled.
   *
   * @throws {LndAdapterError} when the node rejects the cancellation.
   * @example
   * ```ts
   * await adapter.cancelInvoice(invoice.paymentHash);
   * ```
   */
  async cancelInvoice(paymentHash: string): Promise<void> {
    try {
      await this.#api.cancelHodlInvoice({
        lnd: this.#lnd,
        id: normalizePaymentHash(paymentHash),
      });
    } catch (error) {
      throw normalizeLndError(error, "LND failed to cancel invoice");
    }
  }

  /**
   * Settle a held HODL invoice by revealing its preimage.
   *
   * Only valid while the invoice is in the `held` state; the preimage must hash
   * to the invoice's payment hash or LND rejects the call.
   *
   * @throws {LndAdapterError} when the node rejects the settlement.
   * @example
   * ```ts
   * const preimageHex =
   *   "0000000000000000000000000000000000000000000000000000000000000001";
   * await adapter.settleHodlInvoice(preimageHex);
   * ```
   */
  async settleHodlInvoice(preimage: string): Promise<void> {
    try {
      await this.#api.settleHodlInvoice({
        lnd: this.#lnd,
        secret: normalizeHex(preimage, "preimage"),
      });
    } catch (error) {
      throw normalizeLndError(error, "LND failed to settle HODL invoice");
    }
  }

  /**
   * Stream invoice state changes from the node as an async iterable.
   *
   * Events are buffered in arrival order so none are dropped between yields, and
   * the underlying gRPC subscription is canceled when iteration stops.
   *
   * @throws {LndAdapterError} when the subscription errors or emits an invalid
   *   invoice update.
   * @example
   * ```ts
   * for await (const update of adapter.subscribeInvoices()) {
   *   if (update.status === "settled") break;
   * }
   * ```
   */
  async *subscribeInvoices(): AsyncIterable<InvoiceLookup> {
    const subscription = this.#api.subscribeToInvoices({ lnd: this.#lnd });
    const queue: InvoiceLookup[] = [];
    let ended = false;
    let wake: (() => void) | undefined;
    let failure: LndAdapterError | undefined;

    const notify = (): void => {
      const resolve = wake;
      wake = undefined;
      resolve?.();
    };

    const onInvoice = (invoice: SubscribeToInvoicesInvoiceUpdatedEvent): void => {
      try {
        queue.push(invoiceToLookup(invoice));
      } catch (error) {
        failure = normalizeLndError(error, "LND emitted invalid invoice update");
      }
      notify();
    };
    const onError = (error: unknown): void => {
      failure = normalizeLndError(error, "LND invoice subscription failed");
      notify();
    };
    const onEnd = (): void => {
      ended = true;
      notify();
    };

    subscription.on("invoice_updated", onInvoice);
    subscription.on("error", onError);
    subscription.on("end", onEnd);

    try {
      while (true) {
        if (failure !== undefined) {
          throw failure;
        }

        const next = queue.shift();
        if (next !== undefined) {
          yield next;
          continue;
        }

        if (ended) {
          return;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      subscription.off("invoice_updated", onInvoice);
      subscription.off("error", onError);
      subscription.off("end", onEnd);
      const cancellable = subscription as EventEmitter & { cancel?: () => void };
      cancellable.cancel?.();
    }
  }

  #createInvoiceArgs(request: CreateInvoiceRequest): {
    lnd: AuthenticatedLnd;
    mtokens: string;
    description?: string;
    expires_at?: string;
  } {
    if (request.amountMsat < 0n) {
      throw new LndAdapterError("invalid-request", "Invoice amount cannot be negative");
    }
    if (request.expirySeconds !== undefined && request.expirySeconds <= 0) {
      throw new LndAdapterError("invalid-request", "Invoice expirySeconds must be positive");
    }

    const expiresAt =
      request.expirySeconds === undefined
        ? undefined
        : new Date(Date.now() + request.expirySeconds * 1000).toISOString();

    return {
      lnd: this.#lnd,
      mtokens: request.amountMsat.toString(),
      ...(request.description === undefined ? {} : { description: request.description }),
      ...(expiresAt === undefined ? {} : { expires_at: expiresAt }),
    };
  }
}

function invoiceToLookup(
  invoice: GetInvoiceResult | SubscribeToInvoicesInvoiceUpdatedEvent,
): InvoiceLookup {
  const status = invoiceStatus(invoice);
  return {
    status,
    paymentHash: normalizePaymentHash(invoice.id),
    amountMsat: parseMsat(invoiceMtokens(invoice), invoice.tokens),
    ...(invoice.confirmed_at === undefined ? {} : { settledAt: new Date(invoice.confirmed_at) }),
    ...(status === "settled" ? { preimage: normalizeHex(invoice.secret, "preimage") } : {}),
  };
}

function invoiceStatus(
  invoice: GetInvoiceResult | SubscribeToInvoicesInvoiceUpdatedEvent,
): InvoiceStatus {
  if ("is_canceled" in invoice && invoice.is_canceled === true) {
    return "canceled";
  }
  if (invoice.is_confirmed) {
    return "settled";
  }
  if ((invoice as HtlcInvoice).is_held === true) {
    return "held";
  }
  if (Date.parse(invoice.expires_at) <= Date.now()) {
    return "expired";
  }
  return "open";
}

function invoiceMtokens(
  invoice: GetInvoiceResult | SubscribeToInvoicesInvoiceUpdatedEvent,
): string | number | undefined {
  if ("mtokens" in invoice) {
    return invoice.mtokens;
  }
  return undefined;
}

function parseMsat(mtokens: string | number | undefined, tokens?: number): bigint {
  if (mtokens !== undefined) {
    return BigInt(mtokens);
  }
  if (tokens === undefined) {
    throw new LndAdapterError("invalid-request", "Invoice amount is missing");
  }
  return BigInt(tokens) * 1000n;
}

function normalizePaymentHash(value: string): string {
  return normalizeHash32(
    value,
    () => new LndAdapterError("invalid-request", "payment-hash must be hex encoded"),
    () => new LndAdapterError("invalid-request", "Payment hash must be 32 bytes"),
  );
}

function normalizeHex(value: string, label: string): string {
  return normalizeHexString(
    value,
    () => new LndAdapterError("invalid-request", `${label} must be hex encoded`),
  );
}

function normalizeLndError(error: unknown, message: string): LndAdapterError {
  if (error instanceof LndAdapterError) {
    return error;
  }
  const kind = classifyLndError(error);
  return new LndAdapterError(
    kind,
    `${message}: ${redactLndCredentials(formatLndError(error))}`,
    error,
  );
}

function classifyLndError(error: unknown): LndAdapterErrorKind {
  const text = formatLndError(error).toLowerCase();
  if (
    text.includes("econnrefused") ||
    text.includes("unavailable") ||
    text.includes("connection refused")
  ) {
    return "connection-refused";
  }
  if (
    text.includes("permission denied") ||
    text.includes("unauthenticated") ||
    text.includes("unauthorized") ||
    text.includes("macaroon")
  ) {
    return "unauthorized";
  }
  if (text.includes("not found") || text.includes("unknown invoice")) {
    return "not-found";
  }
  if (text.includes("expected") || text.includes("invalid")) {
    return "invalid-request";
  }
  return "lnd-error";
}

function formatLndError(error: unknown): string {
  if (Array.isArray(error)) {
    return error.map((part) => formatLndError(part)).join(" ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const maybeErr = error as { err?: unknown; details?: unknown; message?: unknown };
    return [maybeErr.message, maybeErr.details, maybeErr.err]
      .filter((part) => part !== undefined)
      .map((part) => formatLndError(part))
      .join(" ");
  }
  return String(error);
}

function redactLndCredentials(value: string): string {
  return value
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted-lnd-credential]")
    .replace(
      /\b(macaroon|cert|certificate|tls[_ -]?cert|authorization|bearer|token)\b\s*[:=]\s*[^\s,;)]+/gi,
      "$1=[redacted-lnd-credential]",
    )
    .replace(/\b[0-9a-f]{64,}\b/gi, "[redacted-lnd-credential]")
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "[redacted-lnd-credential]");
}

function fail(message: string): never {
  throw new LndAdapterError("invalid-request", message);
}
