/**
 * Feature flags advertised by a Lightning backend adapter.
 *
 * Middleware reads these flags at construction time and rejects unsupported
 * configurations before serving requests. Concrete adapters should advertise
 * only behavior they implement directly through the `LightningBackend`
 * contract; provider webhooks or dashboard controls do not count unless the
 * adapter exposes them through the normalized methods below.
 */
export interface BackendCapabilities {
  /**
   * `true` when `createInvoice({ hodl: true, paymentHash })` creates an invoice
   * that can be settled later with `settleHodlInvoice(preimage)`.
   */
  readonly hodl: boolean;
  /**
   * `true` when `cancelInvoice(paymentHash)` is available for invoices created
   * by this backend.
   */
  readonly cancelInvoice: boolean;
  /**
   * `true` when `subscribeInvoices()` streams normalized invoice state changes
   * without the caller polling the provider directly.
   */
  readonly streamingInvoices: boolean;
  /**
   * `true` when `createInvoice({ description })` forwards caller-provided
   * descriptions to the provider invoice or charge.
   */
  readonly customDescription: boolean;
}

/**
 * Capability set required by middleware or proxy configuration.
 *
 * Keys set to `true` are checked by `assertBackendSupports`; omitted keys are
 * not required for that deployment.
 */
export type RequiredBackendCapabilities = Partial<Record<keyof BackendCapabilities, true>>;

/** Parsed value type used by adapter environment-variable metadata. */
export type AdapterEnvValueType = "string" | "url" | "boolean";

/**
 * Public metadata for one supported adapter environment variable.
 *
 * Adapter READMEs link to these exported values instead of maintaining
 * separate env-var tables. Secret metadata marks variables whose values must
 * never be logged, echoed in errors, or committed in `.env` files.
 */
export interface AdapterEnvVariableMetadata {
  /** Environment variable name read by the adapter env loader. */
  readonly name: string;
  /** `true` when the loader rejects missing or empty values. */
  readonly required: boolean;
  /** Adapter option path populated from this variable. */
  readonly mapsTo: string;
  /** Parsed value shape. */
  readonly valueType: AdapterEnvValueType;
  /** Default applied when an optional variable is omitted. */
  readonly defaultValue?: string;
  /** Accepted literal values for constrained variables. */
  readonly allowedValues?: readonly string[];
  /** Short description for users configuring the adapter. */
  readonly description: string;
  /** `true` when the value is credential material. */
  readonly secret?: boolean;
}

/** Public support level for one provider capability. */
export type AdapterFeatureSupport = "supported" | "unsupported";

/** Public metadata for one provider capability. */
export interface AdapterFeatureMetadata {
  /** Capability or feature name as exposed in adapter options/contracts. */
  readonly name: string;
  /** Whether the current adapter implementation supports the capability. */
  readonly support: AdapterFeatureSupport;
  /** Short rationale for the support level. */
  readonly description: string;
}

/**
 * Public metadata for a concrete adapter provider.
 *
 * This describes facts that are useful in API reference and CLI/help output
 * without requiring README-maintained capability tables.
 */
export interface AdapterProviderMetadata {
  /** Provider identifier used by the adapter package. */
  readonly provider: BackendKind;
  /** Human-readable provider name. */
  readonly label: string;
  /** Environment variables consumed by the provider env loader. */
  readonly env: readonly AdapterEnvVariableMetadata[];
  /** Provider capability facts. */
  readonly features: readonly AdapterFeatureMetadata[];
}

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
  /** Invoice amount in millisatoshis. Must not be rounded to satoshis by callers. */
  amountMsat: bigint;
  /** Optional provider-facing invoice description when the backend supports it. */
  description?: string;
  /** Optional invoice lifetime in seconds. Backend-specific min/max values may apply. */
  expirySeconds?: number;
  /**
   * Adapter-specific metadata. Concrete adapters document the keys they
   * recognize; unknown keys are ignored by the shared contract.
   */
  metadata?: Record<string, string>;
  /**
   * Request a HODL invoice. Requires `capabilities.hodl === true` and a
   * caller-supplied `paymentHash`.
   */
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
  /** Normalized Boltwall status, independent of provider-specific business names. */
  status: InvoiceStatus;
  /** Lowercase hex payment hash, without a `0x` prefix. */
  paymentHash: string;
  /** Invoice amount in millisatoshis when the backend exposes it. */
  amountMsat?: bigint;
  /** Settlement timestamp when the backend exposes it. */
  settledAt?: Date;
  /**
   * Hex-encoded preimage. Only present when `status === "settled"` and the
   * backend exposes preimages.
   */
  preimage?: string;
}

/**
 * Minimal contract implemented by every Lightning backend adapter.
 *
 * Provider-specific charge IDs, checkout IDs, or invoice IDs remain inside the
 * concrete adapter. Middleware and proxy integrations use `paymentHash`,
 * normalized statuses, and capability flags only.
 */
export interface LightningBackend {
  /** Human-readable backend family for diagnostics and error messages. */
  readonly kind: BackendKind;
  /** Feature flags used for boot-time configuration validation. */
  readonly capabilities: BackendCapabilities;

  /** Create a Lightning invoice and return the normalized payment hash. */
  createInvoice(request: CreateInvoiceRequest): Promise<CreatedInvoice>;
  /** Look up an invoice previously created or indexed by this backend. */
  lookupInvoice(paymentHash: string): Promise<InvoiceLookup>;

  /** Cancel an invoice when `capabilities.cancelInvoice` is `true`. */
  cancelInvoice?(paymentHash: string): Promise<void>;
  /** Settle a held HODL invoice when `capabilities.hodl` is `true`. */
  settleHodlInvoice?(preimage: string): Promise<void>;
  /** Stream invoice updates when `capabilities.streamingInvoices` is `true`. */
  subscribeInvoices?(): AsyncIterable<InvoiceLookup>;
}

/**
 * Validate that a Lightning backend supports every feature required by the
 * calling middleware or proxy configuration.
 *
 * This check is intentionally synchronous so unsupported HODL, cancellation,
 * streaming, or description settings fail during boot instead of on the first
 * paid request.
 *
 * @throws {BackendCapabilityError} when a required capability is not advertised.
 * @example
 * ```ts
 * assertBackendSupports(backend, { hodl: true, cancelInvoice: true });
 * ```
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
