/**
 * Feature flags advertised by a Lightning backend adapter.
 *
 * Middleware reads these flags at construction time and rejects unsupported
 * configurations before serving requests.
 */
export interface BackendCapabilities {
  readonly hodl: boolean;
  readonly cancelInvoice: boolean;
  readonly streamingInvoices: boolean;
  readonly customDescription: boolean;
}

export type RequiredBackendCapabilities = Partial<
  Record<keyof BackendCapabilities, true>
>;

/**
 * Human-readable backend family. The string is descriptive only; security
 * decisions must use capabilities and verified invoice state instead.
 */
export type BackendKind = "lnd" | "btcpay" | "opennode" | "mock" | (string & {});

/**
 * Error thrown when a Boltwall configuration asks a backend to provide a
 * feature its capability flags do not advertise.
 */
export class BackendCapabilityError extends Error {
  readonly kind = "missing-capability";
  readonly capability: keyof BackendCapabilities;
  readonly backendKind: BackendKind;

  constructor(backend: LightningBackend, capability: keyof BackendCapabilities) {
    super(
      `${formatBackendKind(backend.kind)} (kind="${backend.kind}") does not support ${formatCapability(capability)}, but boltwall config requires ${capability}: true.`,
    );
    this.name = "BackendCapabilityError";
    this.capability = capability;
    this.backendKind = backend.kind;
  }
}

/**
 * Request to create a BOLT 11 Lightning invoice.
 *
 * BOLT 11 invoices encode payment requests; Boltwall keeps amounts in
 * millisatoshis as `bigint` throughout to avoid sats/msats truncation bugs.
 */
export interface CreateInvoiceRequest {
  amountMsat: bigint;
  description?: string;
  expirySeconds?: number;
  metadata?: Record<string, string>;
  hodl?: boolean;
  /**
   * Hex-encoded payment hash required when creating a HODL invoice.
   */
  paymentHash?: string;
}

/**
 * Invoice fields returned after backend creation.
 */
export interface CreatedInvoice {
  /** BOLT 11 payment request string. */
  paymentRequest: string;
  /** Lowercase hex payment hash, without a `0x` prefix. */
  paymentHash: string;
  /** Invoice amount in millisatoshis. */
  amountMsat: bigint;
  /** Absolute expiry time when the backend exposes it. */
  expiresAt?: Date;
}

export type InvoiceStatus = "open" | "held" | "settled" | "canceled" | "expired";

/**
 * Current invoice state returned by lookup and subscription streams.
 */
export interface InvoiceLookup {
  status: InvoiceStatus;
  /** Lowercase hex payment hash, without a `0x` prefix. */
  paymentHash: string;
  amountMsat?: bigint;
  settledAt?: Date;
  /**
   * Hex-encoded preimage. Only present when `status === "settled"` and the
   * backend exposes preimages.
   */
  preimage?: string;
}

/**
 * Minimal contract implemented by every Lightning backend adapter.
 */
export interface LightningBackend {
  readonly kind: BackendKind;
  readonly capabilities: BackendCapabilities;

  createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice>;
  lookupInvoice(paymentHash: string): Promise<InvoiceLookup>;

  cancelInvoice?(paymentHash: string): Promise<void>;
  settleHodlInvoice?(preimage: string): Promise<void>;
  subscribeInvoices?(): AsyncIterable<InvoiceLookup>;
}

/**
 * Validate that a Lightning backend supports every feature required by the
 * calling middleware or proxy configuration.
 *
 * This check is intentionally synchronous so unsupported HODL, cancellation,
 * streaming, or description settings fail during boot instead of on the first
 * paid request.
 */
export function assertBackendSupports(
  backend: LightningBackend,
  required: RequiredBackendCapabilities,
): void {
  for (const capability of backendCapabilityKeys) {
    if (required[capability] === true && backend.capabilities[capability] !== true) {
      throw new BackendCapabilityError(backend, capability);
    }
  }
}

const backendCapabilityKeys = [
  "hodl",
  "cancelInvoice",
  "streamingInvoices",
  "customDescription",
] as const satisfies readonly (keyof BackendCapabilities)[];

function formatBackendKind(kind: BackendKind): string {
  if (kind === "lnd") {
    return "LndAdapter";
  }
  if (kind === "btcpay") {
    return "BtcpayAdapter";
  }
  if (kind === "opennode") {
    return "OpenNodeAdapter";
  }
  if (kind === "mock") {
    return "MockAdapter";
  }
  return `${kind} adapter`;
}

function formatCapability(capability: keyof BackendCapabilities): string {
  if (capability === "hodl") {
    return "HODL invoices";
  }
  if (capability === "cancelInvoice") {
    return "invoice cancellation";
  }
  if (capability === "streamingInvoices") {
    return "invoice streaming";
  }
  return "custom invoice descriptions";
}
