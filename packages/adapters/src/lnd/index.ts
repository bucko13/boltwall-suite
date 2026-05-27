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

import type {
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  InvoiceStatus,
  LightningBackend,
} from "../types";

const HEX_32_BYTES_LENGTH = 64;

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
 * Exposed for adapter profiles (e.g. `createVoltageLndAdapter`) and unit
 * tests that need to substitute the gRPC client. Production callers should
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
  const normalized = normalizeHex(value, "payment-hash");
  if (normalized.length !== HEX_32_BYTES_LENGTH) {
    throw new LndAdapterError("invalid-request", "Payment hash must be 32 bytes");
  }
  return normalized;
}

function normalizeHex(value: string, label: string): string {
  const normalized = value.toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized)) {
    throw new LndAdapterError("invalid-request", `${label} must be hex encoded`);
  }
  return normalized;
}

function normalizeLndError(error: unknown, message: string): LndAdapterError {
  if (error instanceof LndAdapterError) {
    return error;
  }
  const kind = classifyLndError(error);
  return new LndAdapterError(kind, `${message}: ${formatLndError(error)}`, error);
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

function fail(message: string): never {
  throw new LndAdapterError("invalid-request", message);
}
