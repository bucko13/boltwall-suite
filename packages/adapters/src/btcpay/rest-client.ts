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
    return this.#request<BtcPayLightningInvoiceData>(
      "POST",
      `/api/v1/stores/${encodeURIComponent(this.#storeId)}/lightning/${encodeURIComponent(
        this.#cryptoCode,
      )}/invoices`,
      body,
    );
  }

  async getLightningInvoice(providerInvoiceId: string): Promise<BtcPayLightningInvoiceData> {
    return this.#request<BtcPayLightningInvoiceData>(
      "GET",
      `/api/v1/stores/${encodeURIComponent(this.#storeId)}/lightning/${encodeURIComponent(
        this.#cryptoCode,
      )}/invoices/${encodeURIComponent(requireNonEmpty(providerInvoiceId, "providerInvoiceId"))}`,
    );
  }

  async #request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
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
      return (await response.json()) as T;
    } catch (error) {
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
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BtcPayAdapterError("invalid-request", "BTCPay baseUrl must use http or https");
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

function redactSensitive(value: string, apiKey: string): string {
  return value
    .replaceAll(apiKey, "[redacted]")
    .replace(/token\s+[A-Za-z0-9._~+/=-]+/gi, "token [redacted]");
}
