export type OpenNodeFetch = typeof globalThis.fetch;

/**
 * Subset of an OpenNode charge resource consumed by the adapter.
 *
 * Fields are loosely typed because the API response is validated downstream.
 */
export interface OpenNodeCharge {
  id?: unknown;
  status?: string;
  amount?: number;
  lightning_invoice?: {
    payreq?: unknown;
    expires_at?: unknown;
  };
}

/**
 * Connection settings for the OpenNode REST client.
 *
 * Carries the API credential and base URL used to authenticate every request.
 */
export interface OpenNodeRestClientOptions {
  apiKey: string;
  baseUrl: string;
  fetch?: OpenNodeFetch;
}

export type OpenNodeApiErrorKind =
  | "connection-refused"
  | "unauthorized"
  | "not-found"
  | "invalid-request"
  | "opennode-error";

export class OpenNodeApiError extends Error {
  readonly kind: OpenNodeApiErrorKind;
  readonly status: number | undefined;
  override readonly cause: unknown;

  constructor(
    kind: OpenNodeApiErrorKind,
    message: string,
    opts: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "OpenNodeApiError";
    this.kind = kind;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

export class OpenNodeRestClient {
  readonly #apiKey: string;
  readonly #baseUrl: URL;
  readonly #fetch: OpenNodeFetch;

  /**
   * Build a client for one OpenNode account.
   *
   * `baseUrl` is normalized to require HTTPS so the API key is never sent in
   * cleartext.
   *
   * @throws {OpenNodeApiError} when `apiKey` is empty or `baseUrl` is not an
   *   absolute HTTPS URL.
   * @example
   * ```ts
   * const client = new OpenNodeRestClient({
   *   apiKey: process.env.OPENNODE_API_KEY!,
   *   baseUrl: "https://api.opennode.com",
   * });
   * ```
   */
  constructor(opts: OpenNodeRestClientOptions) {
    if (opts.apiKey.trim() === "") {
      throw new OpenNodeApiError("invalid-request", "OpenNode apiKey is required");
    }
    this.#apiKey = opts.apiKey;
    this.#baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.#fetch = opts.fetch ?? globalThis.fetch;
  }

  /**
   * Call OpenNode `POST /v1/charges` and unwrap the `data` envelope.
   *
   * `body.amount` is in satoshis per the OpenNode charge API, not millisatoshis.
   *
   * @example
   * ```ts
   * const charge = await client.createCharge({ amount: 1000 });
   * ```
   */
  async createCharge(body: Record<string, unknown>): Promise<OpenNodeCharge> {
    return this.#request("/v1/charges", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /**
   * Call OpenNode `GET /v2/charge/{id}` and unwrap the `data` envelope.
   *
   * `chargeId` is OpenNode's opaque charge id, not the BOLT 11 payment hash.
   *
   * @example
   * ```ts
   * const charge = await client.getCharge(charge.id);
   * ```
   */
  async getCharge(chargeId: string): Promise<OpenNodeCharge> {
    return this.#request(`/v2/charge/${encodeURIComponent(chargeId)}`, {
      method: "GET",
    });
  }

  async #request(path: string, init: RequestInit): Promise<OpenNodeCharge> {
    const url = new URL(path, this.#baseUrl);
    let response: Response;
    try {
      response = await this.#fetch(url, {
        ...init,
        headers: {
          Authorization: this.#apiKey,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      throw new OpenNodeApiError(
        "connection-refused",
        `OpenNode request failed: ${redact(String(formatUnknown(error)), this.#apiKey)}`,
        { cause: error },
      );
    }

    const payload = await readJson(response, this.#apiKey);
    if (!response.ok) {
      throw new OpenNodeApiError(
        classifyHttpStatus(response.status),
        `OpenNode API returned HTTP ${response.status}: ${responseSummary(payload, this.#apiKey)}`,
        { status: response.status, cause: payload },
      );
    }
    return unwrapCharge(payload);
  }
}

function normalizeBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new OpenNodeApiError("invalid-request", "OpenNode baseUrl must be an absolute URL", {
      cause: error,
    });
  }
  if (url.protocol !== "https:") {
    throw new OpenNodeApiError("invalid-request", "OpenNode baseUrl must use HTTPS");
  }
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.search = "";
  url.hash = "";
  return url;
}

async function readJson(response: Response, apiKey: string): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new OpenNodeApiError(
      "opennode-error",
      `OpenNode API returned invalid JSON: ${redact(text, apiKey)}`,
      { status: response.status, cause: error },
    );
  }
}

function unwrapCharge(payload: unknown): OpenNodeCharge {
  if (typeof payload !== "object" || payload === null) {
    throw new OpenNodeApiError("opennode-error", "OpenNode API returned a non-object response");
  }
  const data = (payload as { data?: unknown }).data;
  const candidate = data === undefined ? payload : data;
  if (typeof candidate !== "object" || candidate === null) {
    throw new OpenNodeApiError("opennode-error", "OpenNode API response data was not an object");
  }
  return candidate as OpenNodeCharge;
}

function classifyHttpStatus(status: number): OpenNodeApiErrorKind {
  if (status === 401 || status === 403) {
    return "unauthorized";
  }
  if (status === 404) {
    return "not-found";
  }
  if (status >= 400 && status < 500) {
    return "invalid-request";
  }
  if (status >= 500) {
    return "connection-refused";
  }
  return "opennode-error";
}

function responseSummary(payload: unknown, apiKey: string): string {
  if (typeof payload === "object" && payload !== null) {
    const maybe = payload as { message?: unknown; error?: unknown; status?: unknown };
    for (const value of [maybe.message, maybe.error, maybe.status]) {
      if (typeof value === "string" && value.trim() !== "") {
        return redact(value, apiKey);
      }
    }
  }
  return redact(JSON.stringify(payload), apiKey);
}

function formatUnknown(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function redact(value: string, apiKey: string): string {
  let redacted = value;
  if (apiKey !== "") {
    redacted = redacted.split(apiKey).join("[redacted-opennode-api-key]");
  }
  return redacted.replace(/\b(?:lnbc|lntb|lnbcrt|lnts)[a-z0-9]{40,}\b/gi, "[redacted-bolt11]");
}
