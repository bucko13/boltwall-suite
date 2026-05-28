/**
 * Fetch-compatible function used by the BTCPay REST client.
 */
export type BtcPayFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * Stable classification for BTCPay adapter failures.
 */
export type BtcPayAdapterErrorKind =
  | "connection-refused"
  | "unauthorized"
  | "not-found"
  | "invalid-request"
  | "invalid-response"
  | "unsupported-feature"
  | "btcpay-error";

/**
 * Error type thrown by `BtcPayAdapter` and its Greenfield REST client.
 *
 * Messages redact credentials and avoid echoing BTCPay response bodies that may
 * include deployment-specific details.
 */
export class BtcPayAdapterError extends Error {
  readonly kind: BtcPayAdapterErrorKind;
  override readonly cause: unknown;

  constructor(kind: BtcPayAdapterErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = "BtcPayAdapterError";
    this.kind = kind;
    this.cause = cause;
  }
}

export interface BtcPayRestClientOptions {
  /** BTCPay Server origin, optionally including a path prefix. */
  baseUrl: string;
  /** Greenfield API key. Sent as `Authorization: token <api-key>`. */
  apiKey: string;
  /** BTCPay store id used in Greenfield store Lightning routes. */
  storeId: string;
  /** Greenfield cryptocurrency code, normally `BTC`. */
  cryptoCode: string;
  /** Optional fetch implementation for tests or custom runtimes. */
  fetch?: BtcPayFetch;
}

export interface BtcPayCreateLightningInvoiceRequest {
  /**
   * Amount wrapped in a string, represented in millisatoshis.
   *
   * Source: BTCPay Server Greenfield API v1
   * `CreateLightningInvoiceRequest.amount`.
   */
  amount: string;
  /** Description of the invoice in the BOLT11. */
  description?: string;
  /** Expiration time in seconds. */
  expiry?: number;
}

export type BtcPayLightningInvoiceStatus = "Expired" | "Paid" | "Unpaid";

/**
 * Subset of BTCPay Greenfield `LightningInvoiceData` consumed by the adapter.
 */
export interface BtcPayLightningInvoiceData {
  /** Opaque BTCPay Lightning invoice id used only inside the adapter. */
  id: string;
  /** Documented Greenfield Lightning invoice status. */
  status: BtcPayLightningInvoiceStatus;
  /** BOLT11 payment request. The field name is uppercase in Greenfield. */
  BOLT11: string;
  /** Unix timestamp in seconds when the invoice was paid, when available. */
  paidAt?: number | null;
  /** Unix timestamp in seconds when the invoice expires. */
  expiresAt?: number;
  /** Invoice amount in millisatoshis, encoded as a string. */
  amount: string;
  /** Received amount in millisatoshis, encoded as a string. */
  amountReceived?: string;
  /** Hex-encoded payment hash. */
  paymentHash: string;
  /** Hex-encoded preimage, available only when BTCPay exposes it. */
  preimage?: string | null;
  /** Optional keysend/custom TLV records returned by BTCPay. */
  customRecords?: Record<string, unknown> | null;
}

/**
 * Minimal Greenfield REST client for BTCPay store Lightning invoices.
 *
 * Endpoint/auth sources:
 * - BTCPay Greenfield API v1 `StoreLightningNodeApi_CreateInvoice`
 * - BTCPay Greenfield API v1 `StoreLightningNodeApi_GetInvoice`
 * - BTCPay eCommerce Integration Guide, Authentication section:
 *   `Authorization: token API_KEY`
 */
export class BtcPayRestClient {
  readonly #baseUrl: URL;
  readonly #apiKey: string;
  readonly #storeId: string;
  readonly #cryptoCode: string;
  readonly #fetch: BtcPayFetch;

  constructor(opts: BtcPayRestClientOptions) {
    this.#baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.#apiKey = requireNonEmpty(opts.apiKey, "apiKey");
    this.#storeId = requireNonEmpty(opts.storeId, "storeId");
    this.#cryptoCode = normalizeCryptoCode(opts.cryptoCode);
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async createLightningInvoice(
    body: BtcPayCreateLightningInvoiceRequest,
  ): Promise<BtcPayLightningInvoiceData> {
    return this.#request(
      "POST",
      `/api/v1/stores/${encodeURIComponent(this.#storeId)}/lightning/${encodeURIComponent(
        this.#cryptoCode,
      )}/invoices`,
      body,
    );
  }

  async getLightningInvoice(providerInvoiceId: string): Promise<BtcPayLightningInvoiceData> {
    return this.#request(
      "GET",
      `/api/v1/stores/${encodeURIComponent(this.#storeId)}/lightning/${encodeURIComponent(
        this.#cryptoCode,
      )}/invoices/${encodeURIComponent(requireNonEmpty(providerInvoiceId, "providerInvoiceId"))}`,
    );
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<BtcPayLightningInvoiceData> {
    const url = new URL(path.replace(/^\//, ""), this.#baseUrl);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method,
        headers: {
          accept: "application/json",
          authorization: `token ${this.#apiKey}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new BtcPayAdapterError(
        "connection-refused",
        "BTCPay request failed before receiving a response",
        error,
      );
    }

    if (!response.ok) {
      throw await responseToError(response, this.#apiKey);
    }

    try {
      return parseLightningInvoiceData(await response.json());
    } catch (error) {
      if (error instanceof BtcPayAdapterError) {
        throw error;
      }
      throw new BtcPayAdapterError("invalid-response", "BTCPay response was not valid JSON", error);
    }
  }
}

async function responseToError(response: Response, apiKey: string): Promise<BtcPayAdapterError> {
  const status = response.status;
  const kind = classifyStatus(status);
  const problem = await readProblemTitle(response, apiKey);
  const suffix = problem === undefined ? "" : ` (${problem})`;
  return new BtcPayAdapterError(kind, `BTCPay request failed with HTTP ${status}${suffix}`);
}

function classifyStatus(status: number): BtcPayAdapterErrorKind {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not-found";
  }
  if (status === 400 || status === 422) {
    return "invalid-request";
  }
  if (status === 503) {
    return "connection-refused";
  }
  return "btcpay-error";
}

async function readProblemTitle(response: Response, apiKey: string): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    const body = (await response.json()) as { title?: unknown };
    return typeof body.title === "string" && body.title.trim() !== ""
      ? redactSensitive(body.title, apiKey)
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeBaseUrl(raw: string): URL {
  const trimmed = requireNonEmpty(raw, "baseUrl");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch (cause) {
    throw new BtcPayAdapterError("invalid-request", "BTCPay baseUrl is not a valid URL", cause);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost(url.hostname))) {
    throw new BtcPayAdapterError(
      "invalid-request",
      "BTCPay baseUrl must use HTTPS unless it targets localhost for local testing",
    );
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
  url.search = "";
  url.hash = "";
  return url;
}

function normalizeCryptoCode(raw: string): string {
  const value = requireNonEmpty(raw, "cryptoCode").toUpperCase();
  if (!/^[A-Z0-9]+$/.test(value)) {
    throw new BtcPayAdapterError("invalid-request", "BTCPay cryptoCode must be alphanumeric");
  }
  return value;
}

function requireNonEmpty(value: string, label: string): string {
  if (value.trim() === "") {
    throw new BtcPayAdapterError("invalid-request", `BTCPay ${label} is required`);
  }
  return value.trim();
}

function parseLightningInvoiceData(payload: unknown): BtcPayLightningInvoiceData {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new BtcPayAdapterError("invalid-response", "BTCPay response was not an invoice object");
  }

  const candidate = payload as Record<string, unknown>;
  const status = candidate.status;
  if (status !== "Expired" && status !== "Paid" && status !== "Unpaid") {
    throw new BtcPayAdapterError("invalid-response", "BTCPay invoice status was invalid");
  }

  return {
    id: requireStringField(candidate.id, "invoice id"),
    status,
    BOLT11: requireStringField(candidate.BOLT11, "BOLT11 invoice"),
    amount: requireStringField(candidate.amount, "invoice amount"),
    paymentHash: requireStringField(candidate.paymentHash, "payment hash"),
    ...(candidate.paidAt === undefined
      ? {}
      : { paidAt: optionalNumberOrNull(candidate.paidAt, "paidAt") }),
    ...(candidate.expiresAt === undefined
      ? {}
      : { expiresAt: requireNumberField(candidate.expiresAt, "expiresAt") }),
    ...(candidate.amountReceived === undefined
      ? {}
      : { amountReceived: requireStringField(candidate.amountReceived, "amount received") }),
    ...(candidate.preimage === undefined
      ? {}
      : { preimage: optionalStringOrNull(candidate.preimage, "preimage") }),
    ...(candidate.customRecords === undefined
      ? {}
      : { customRecords: optionalRecordOrNull(candidate.customRecords, "custom records") }),
  };
}

function requireStringField(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new BtcPayAdapterError("invalid-response", `BTCPay ${label} was missing or invalid`);
  }
  return value;
}

function requireNumberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BtcPayAdapterError("invalid-response", `BTCPay ${label} was missing or invalid`);
  }
  return value;
}

function optionalNumberOrNull(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }
  return requireNumberField(value, label);
}

function optionalStringOrNull(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  return requireStringField(value, label);
}

function optionalRecordOrNull(value: unknown, label: string): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BtcPayAdapterError("invalid-response", `BTCPay ${label} was invalid`);
  }
  return value as Record<string, unknown>;
}

function isLocalhost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function redactSensitive(value: string, apiKey: string): string {
  return value
    .replaceAll(apiKey, "[redacted]")
    .replace(/token\s+[A-Za-z0-9._~+/=-]+/gi, "token [redacted]");
}
