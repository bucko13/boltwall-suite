import { decodeBolt11Invoice } from "@boltwall/l402";
import { NWCClient } from "@getalby/sdk/nwc";

import { normalizeHash32 } from "../internal/hex";
import type {
  AdapterProviderMetadata,
  BackendCapabilities,
  BackendKind,
  CreatedInvoice,
  CreateInvoiceRequest,
  InvoiceLookup,
  InvoiceStatus,
  LightningBackend,
} from "../types";

import { NwcEnvError, loadNwcEnv, nwcEnvVariables } from "./env";

export { loadNwcEnv, NwcEnvError, nwcEnvVariables, type NwcEnv } from "./env";

/**
 * Provider details for the Nostr Wallet Connect adapter.
 *
 * The PoC targets Alby Hub and other NIP-47 wallet services that implement
 * `make_invoice` and `lookup_invoice`.
 */
export const nwcProviderMetadata = {
  provider: "nwc",
  label: "Nostr Wallet Connect",
  env: nwcEnvVariables,
  features: [
    {
      name: "customDescription",
      support: "supported",
      description: "Invoice descriptions are forwarded to NIP-47 make_invoice.",
    },
    {
      name: "hodlInvoices",
      support: "unsupported",
      description:
        "Alby Hub documents NWC hold-invoice support, but this PoC does not advertise HODL until tested against target wallet services.",
    },
    {
      name: "cancelInvoice",
      support: "unsupported",
      description: "Standard NWC invoice cancellation is not exposed by this adapter.",
    },
    {
      name: "streamingInvoices",
      support: "unsupported",
      description: "The PoC uses explicit lookup polling rather than notification subscriptions.",
    },
  ],
} as const satisfies AdapterProviderMetadata;

type NwcTransactionState = "settled" | "pending" | "failed" | "accepted" | "expired";

export interface NwcTransaction {
  invoice: string;
  payment_hash?: string;
  amount?: number;
  state?: NwcTransactionState;
  preimage?: string;
  settled_at?: number;
  expires_at?: number;
}

export interface NwcClientLike {
  makeInvoice(request: {
    amount: number;
    description?: string;
    expiry?: number;
    metadata?: Record<string, unknown>;
  }): Promise<NwcTransaction>;
  lookupInvoice(request: { payment_hash?: string; invoice?: string }): Promise<NwcTransaction>;
  close?(): void;
}

export type NwcClientFactory = (nostrWalletConnectUrl: string) => NwcClientLike;

export interface NwcAdapterFeatures {
  /** Reserved until hold-invoice behavior is validated against target NWC wallets. */
  hodlInvoices?: boolean;
  /** Reserved for future notification-backed invoice updates. */
  streamingInvoices?: boolean;
}

export interface NwcAdapterOptions {
  /**
   * NWC connection string from Alby Hub or another NIP-47 wallet service.
   *
   * This is a bearer credential and must be treated like a secret.
   */
  nostrWalletConnectUrl: string;
  /** Injected client factory for tests or custom runtimes. */
  clientFactory?: NwcClientFactory;
  /** Explicit deployment feature flags. Unsupported `true` flags fail at boot. */
  features?: NwcAdapterFeatures;
}

export type NwcAdapterErrorKind =
  "invalid-request" | "invalid-response" | "not-found" | "unsupported-feature" | "nwc-error";

/**
 * Error thrown by `NwcAdapter` for invalid configuration, unsupported features,
 * wallet failures, and unnormalizable NWC responses.
 */
export class NwcAdapterError extends Error {
  readonly kind: NwcAdapterErrorKind;
  override readonly cause: unknown;

  constructor(kind: NwcAdapterErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "NwcAdapterError";
    this.kind = kind;
    this.cause = redactNwcCause(cause);
  }
}

/**
 * Nostr Wallet Connect backend adapter.
 *
 * This PoC uses NIP-47 `make_invoice` and `lookup_invoice` so a Boltwall proxy
 * can receive Lightning payments through Alby Hub or another NWC wallet service
 * without exposing direct LND gRPC. It intentionally advertises only standard
 * invoices and description forwarding until HODL/cancel/streaming semantics are
 * validated against real wallet services.
 */
export class NwcAdapter implements LightningBackend {
  readonly kind: BackendKind = "nwc";
  readonly capabilities: BackendCapabilities = {
    // TODO: Add NWC HODL support via Alby/NWC make_hold_invoice,
    // settle_hold_invoice, cancel_hold_invoice, and hold_invoice_accepted once
    // the permission model and live adapter behavior are validated.
    // https://getalby.com/blog/build-conditional-payment-logic-into-your-app
    hodl: false,
    cancelInvoice: false,
    streamingInvoices: false,
    customDescription: true,
  };

  readonly #client: NwcClientLike;

  constructor(opts: NwcAdapterOptions) {
    const nostrWalletConnectUrl = normalizeNwcConnectionString(opts.nostrWalletConnectUrl);
    if (opts.features?.hodlInvoices === true) {
      throw new NwcAdapterError(
        "unsupported-feature",
        "NWC HODL invoices are not enabled by this proof-of-concept adapter",
      );
    }
    if (opts.features?.streamingInvoices === true) {
      throw new NwcAdapterError(
        "unsupported-feature",
        "NWC invoice streaming is not implemented by this proof-of-concept adapter",
      );
    }

    this.#client = (opts.clientFactory ?? defaultNwcClientFactory)(nostrWalletConnectUrl);
  }

  async createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice> {
    if (request.amountMsat < 0n) {
      throw new NwcAdapterError("invalid-request", "Invoice amount cannot be negative");
    }
    if (request.amountMsat > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new NwcAdapterError("invalid-request", "NWC invoice amount is too large");
    }
    if (request.expirySeconds !== undefined && request.expirySeconds <= 0) {
      throw new NwcAdapterError("invalid-request", "Invoice expirySeconds must be positive");
    }
    if (request.hodl === true) {
      throw new NwcAdapterError("unsupported-feature", "NWC HODL invoice creation is not enabled");
    }

    try {
      const invoice = await this.#client.makeInvoice({
        amount: Number(request.amountMsat),
        ...(request.description === undefined ? {} : { description: request.description }),
        ...(request.expirySeconds === undefined ? {} : { expiry: request.expirySeconds }),
        ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
      });
      const paymentRequest = requireNonEmptyString(invoice.invoice, "invoice");
      const decoded = decodeBolt11Invoice(paymentRequest);
      const responseHash = invoice.payment_hash?.trim();
      const paymentHash =
        responseHash === undefined || responseHash === ""
          ? normalizePaymentHash(decoded.paymentHashHex)
          : normalizePaymentHash(responseHash);
      if (paymentHash !== normalizePaymentHash(decoded.paymentHashHex)) {
        throw new NwcAdapterError(
          "invalid-response",
          "NWC invoice payment hash does not match BOLT 11 invoice",
        );
      }
      const amountMsat = parseCreatedNwcAmount(invoice.amount, decoded.amountMsat);
      validateCreatedAmount(request.amountMsat, amountMsat);

      return {
        paymentRequest,
        paymentHash,
        amountMsat,
        ...(invoice.expires_at === undefined
          ? {}
          : { expiresAt: unixSecondsToDate(invoice.expires_at) }),
      };
    } catch (error) {
      if (error instanceof NwcAdapterError) throw error;
      throw normalizeNwcError(error, "NWC wallet failed to create invoice");
    }
  }

  async lookupInvoice(paymentHash: string): Promise<InvoiceLookup> {
    const normalizedHash = normalizePaymentHash(paymentHash);
    try {
      const invoice = await this.#client.lookupInvoice({ payment_hash: normalizedHash });
      const responseHash = invoice.payment_hash?.trim();
      if (
        responseHash !== undefined &&
        responseHash !== "" &&
        normalizePaymentHash(responseHash) !== normalizedHash
      ) {
        throw new NwcAdapterError(
          "invalid-response",
          "NWC lookup payment hash does not match request",
        );
      }
      const result: InvoiceLookup = {
        status: mapNwcState(invoice.state),
        paymentHash: normalizedHash,
      };
      const amountMsat = parseNwcAmount(invoice.amount, undefined);
      if (amountMsat !== undefined) result.amountMsat = amountMsat;
      if (invoice.settled_at !== undefined)
        result.settledAt = unixSecondsToDate(invoice.settled_at);
      if (
        result.status === "settled" &&
        invoice.preimage !== undefined &&
        invoice.preimage !== ""
      ) {
        result.preimage = normalizePreimage(invoice.preimage);
      }
      return result;
    } catch (error) {
      if (error instanceof NwcAdapterError) throw error;
      throw normalizeNwcError(error, "NWC wallet failed to look up invoice");
    }
  }

  close(): void {
    this.#client.close?.();
  }
}

/**
 * Create an NWC adapter from an env-like record.
 *
 * Reads `NWC_CONNECTION_STRING` from `env`.
 */
export function createNwcAdapterFromEnv(
  env: Record<string, string | undefined> = process.env,
  opts: Omit<NwcAdapterOptions, "nostrWalletConnectUrl"> = {},
): NwcAdapter {
  const loaded = loadNwcEnv(env);
  return new NwcAdapter({ ...opts, ...loaded });
}

function defaultNwcClientFactory(nostrWalletConnectUrl: string): NwcClientLike {
  return new NWCClient({ nostrWalletConnectUrl });
}

function normalizeNwcConnectionString(nostrWalletConnectUrl: string): string {
  try {
    return loadNwcEnv({ NWC_CONNECTION_STRING: nostrWalletConnectUrl }).nostrWalletConnectUrl;
  } catch (error) {
    if (error instanceof NwcEnvError) {
      throw new NwcAdapterError("invalid-request", "NWC connection string is invalid", error);
    }
    throw error;
  }
}

function normalizePaymentHash(value: string): string {
  return normalizeHash32(
    value,
    () => new NwcAdapterError("invalid-response", "NWC payment hash must be hex encoded"),
    () => new NwcAdapterError("invalid-response", "NWC payment hash must be 32 bytes"),
  );
}

function parseCreatedNwcAmount(value: number | undefined, fallback: bigint): bigint {
  return parseNwcAmount(value, fallback) ?? fallback;
}

function parseNwcAmount(
  value: number | undefined,
  fallback: bigint | undefined,
): bigint | undefined {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new NwcAdapterError(
      "invalid-response",
      "NWC invoice amount must be a non-negative safe integer number of millisatoshis",
    );
  }
  return BigInt(value);
}

function validateCreatedAmount(requested: bigint, actual: bigint): void {
  if (requested !== actual) {
    throw new NwcAdapterError("invalid-response", "NWC invoice amount did not match request");
  }
}

function mapNwcState(state: NwcTransactionState | undefined): InvoiceStatus {
  if (state === "settled") return "settled";
  if (state === "failed") return "canceled";
  if (state === "accepted") return "held";
  if (state === "expired") return "expired";
  return "open";
}

function unixSecondsToDate(seconds: number): Date {
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    throw new NwcAdapterError(
      "invalid-response",
      "NWC timestamp must be a non-negative safe integer Unix timestamp",
    );
  }
  return new Date(seconds * 1000);
}

function normalizePreimage(value: string): string {
  return normalizeHash32(
    value,
    () => new NwcAdapterError("invalid-response", "NWC preimage must be hex encoded"),
    () => new NwcAdapterError("invalid-response", "NWC preimage must be 32 bytes"),
  );
}

function requireNonEmptyString(value: string | undefined, label: string): string {
  if (value === undefined || value.trim() === "") {
    throw new NwcAdapterError("invalid-response", `NWC response missing ${label}`);
  }
  return value.trim();
}

function normalizeNwcError(error: unknown, message: string): NwcAdapterError {
  if (isNwcNotFoundError(error)) {
    return new NwcAdapterError("not-found", message, error);
  }
  return new NwcAdapterError("nwc-error", message, error);
}

function isNwcNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "";
  return /not[_ -]?found/i.test(code) || /not[_ -]?found/i.test(message);
}

function redactNwcCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    const redacted = new Error(redactNwcSecret(cause.message));
    redacted.name = cause.name;
    return redacted;
  }
  if (typeof cause === "string") {
    return redactNwcSecret(cause);
  }
  if (typeof cause === "object" && cause !== null) {
    const fields = cause as { code?: unknown; message?: unknown; name?: unknown };
    return {
      ...(typeof fields.name === "string" ? { name: fields.name } : {}),
      ...(typeof fields.code === "string" ? { code: redactNwcSecret(fields.code) } : {}),
      ...(typeof fields.message === "string" ? { message: redactNwcSecret(fields.message) } : {}),
    };
  }
  return cause;
}

function redactNwcSecret(value: string): string {
  return value
    .replace(/nostr\+walletconnect:\/\/[^\s"')]+/giu, "[redacted-nwc-connection-string]")
    .replace(/(secret=)[^&\s"')]+/giu, "$1[redacted]")
    .replace(/\b[0-9a-f]{64}\b/giu, "[redacted-nwc-secret]");
}
