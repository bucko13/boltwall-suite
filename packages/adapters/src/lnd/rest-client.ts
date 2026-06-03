import { Agent, request as httpsRequest } from "node:https";

/**
 * Low-level HTTP exchange used by {@link LndRestClient}.
 *
 * The default transport is built on `node:https` rather than `fetch` because LND
 * nodes (including Voltage) serve their REST API behind a self-signed TLS
 * certificate. `node:https` accepts that certificate as a per-request CA through
 * an `Agent`, which the WHATWG `fetch` available on serverless runtimes cannot do
 * without an undici dispatcher that is not guaranteed to be importable there.
 * Tests inject a transport to avoid real network and TLS.
 */
export type LndRestTransport = (request: LndRestHttpRequest) => Promise<LndRestHttpResponse>;

/** A single HTTP request issued to the LND REST API. */
export interface LndRestHttpRequest {
  /** Absolute request URL. */
  url: string;
  /** HTTP method. LND's invoice endpoints use only GET and POST. */
  method: "GET" | "POST";
  /** Request headers, including the macaroon auth header. */
  headers: Record<string, string>;
  /** JSON request body, omitted for GET requests. */
  body?: string;
  /** TLS agent carrying the node's certificate as a CA, when one was supplied. */
  agent?: Agent;
}

/** The raw HTTP response returned by an {@link LndRestTransport}. */
export interface LndRestHttpResponse {
  /** HTTP status code. */
  status: number;
  /** Response body as text; parsed as JSON by the client. */
  body: string;
}

const nodeHttpsTransport: LndRestTransport = (request) =>
  new Promise<LndRestHttpResponse>((resolve, reject) => {
    const req = httpsRequest(
      request.url,
      { method: request.method, headers: request.headers, agent: request.agent },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    if (request.body !== undefined) {
      req.write(request.body);
    }
    req.end();
  });

/** Stable classification for {@link LndRestApiError}. */
export type LndRestApiErrorKind =
  | "connection-refused"
  | "unauthorized"
  | "not-found"
  | "invalid-request"
  | "lnd-error";

/**
 * Error thrown by {@link LndRestClient} when LND rejects a request, the
 * connection fails, or a response cannot be parsed.
 */
export class LndRestApiError extends Error {
  readonly kind: LndRestApiErrorKind;
  readonly status: number | undefined;
  override readonly cause: unknown;

  constructor(
    kind: LndRestApiErrorKind,
    message: string,
    opts: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "LndRestApiError";
    this.kind = kind;
    this.status = opts.status;
    this.cause = opts.cause;
  }
}

/** Subset of the LND `lnrpc.AddInvoiceResponse` consumed by the adapter. */
export interface LndAddInvoiceResponse {
  /** 32-byte payment hash, base64-encoded per LND's REST byte encoding. */
  r_hash?: unknown;
  /** BOLT 11 payment request. */
  payment_request?: unknown;
}

/** Subset of the LND `lnrpc.Invoice` resource consumed by the adapter. */
export interface LndInvoice {
  r_hash?: unknown;
  r_preimage?: unknown;
  payment_request?: unknown;
  value_msat?: unknown;
  value?: unknown;
  settled?: unknown;
  /** `OPEN` | `SETTLED` | `CANCELED` | `ACCEPTED`. */
  state?: unknown;
  /** Settlement time in seconds since the Unix epoch, as a string. */
  settle_date?: unknown;
  /** Creation time in seconds since the Unix epoch, as a string. */
  creation_date?: unknown;
  /** Invoice lifetime in seconds, as a string. */
  expiry?: unknown;
}

/** Connection settings for {@link LndRestClient}. */
export interface LndRestClientOptions {
  /** REST base URL, e.g. `https://node.voltageapp.io:8080`. Must be HTTPS. */
  baseUrl: string;
  /** Hex-encoded macaroon sent in the `Grpc-Metadata-macaroon` header. */
  macaroonHex: string;
  /** PEM TLS certificate trusted as the CA for the node's self-signed endpoint. */
  cert?: string;
  /** Injected transport for tests; defaults to a `node:https` implementation. */
  transport?: LndRestTransport;
}

/**
 * Thin client over LND's REST invoice endpoints, using plain HTTPS with the
 * macaroon auth header — no gRPC, `lightning`, `tiny-secp256k1`, or wasm.
 */
export class LndRestClient {
  readonly #baseUrl: URL;
  readonly #macaroonHex: string;
  readonly #agent: Agent | undefined;
  readonly #transport: LndRestTransport;

  /**
   * Build a client for one LND node's REST API.
   *
   * `baseUrl` is normalized to require HTTPS so the macaroon is never sent in
   * cleartext. When `cert` is provided it is trusted as the CA for the node's
   * self-signed certificate.
   *
   * @throws {LndRestApiError} when `baseUrl` is not an absolute HTTPS URL.
   * @example
   * ```ts
   * const client = new LndRestClient({
   *   baseUrl: "https://node.voltageapp.io:8080",
   *   macaroonHex: "0201036c6e64...",
   *   cert: process.env.LND_TLS_CERT_PEM,
   * });
   * ```
   */
  constructor(opts: LndRestClientOptions) {
    this.#baseUrl = normalizeBaseUrl(opts.baseUrl);
    this.#macaroonHex = opts.macaroonHex;
    this.#agent = opts.cert === undefined ? undefined : new Agent({ ca: opts.cert });
    this.#transport = opts.transport ?? nodeHttpsTransport;
  }

  /**
   * Call LND `POST /v1/invoices` (AddInvoice) and return the created invoice.
   *
   * `body.value_msat` is millisatoshis as a string per LND's JSON encoding of
   * 64-bit integers.
   *
   * @example
   * ```ts
   * const created = await client.addInvoice({ value_msat: "1000", memo: "Pokedex" });
   * ```
   */
  async addInvoice(body: Record<string, unknown>): Promise<LndAddInvoiceResponse> {
    return this.#request("POST", "v1/invoices", body) as Promise<LndAddInvoiceResponse>;
  }

  /**
   * Call LND `GET /v1/invoice/{r_hash_str}` (LookupInvoice) by hex payment hash.
   *
   * @example
   * ```ts
   * const invoice = await client.lookupInvoice("a2c1...32-byte-hex");
   * ```
   */
  async lookupInvoice(paymentHashHex: string): Promise<LndInvoice> {
    return this.#request(
      "GET",
      `v1/invoice/${encodeURIComponent(paymentHashHex)}`,
    ) as Promise<LndInvoice>;
  }

  async #request(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const url = new URL(path, this.#baseUrl);
    const headers: Record<string, string> = {
      "Grpc-Metadata-macaroon": this.#macaroonHex,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    let response: LndRestHttpResponse;
    try {
      response = await this.#transport({
        url: url.toString(),
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(this.#agent === undefined ? {} : { agent: this.#agent }),
      });
    } catch (error) {
      throw new LndRestApiError(
        "connection-refused",
        `LND REST request failed: ${redact(formatUnknown(error))}`,
        { cause: error },
      );
    }

    const payload = parseJson(response);
    if (response.status < 200 || response.status >= 300) {
      throw new LndRestApiError(
        classifyHttpStatus(response.status),
        `LND REST returned HTTP ${response.status}: ${redact(responseSummary(payload))}`,
        { status: response.status, cause: payload },
      );
    }
    return payload;
  }
}

function normalizeBaseUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch (error) {
    throw new LndRestApiError("invalid-request", "LND REST baseUrl must be an absolute URL", {
      cause: error,
    });
  }
  if (url.protocol !== "https:") {
    throw new LndRestApiError("invalid-request", "LND REST baseUrl must use HTTPS");
  }
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.search = "";
  url.hash = "";
  return url;
}

function parseJson(response: LndRestHttpResponse): unknown {
  const text = response.body.trim();
  if (text === "") {
    return {};
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new LndRestApiError(
      "lnd-error",
      `LND REST returned invalid JSON: ${redact(text)}`,
      { status: response.status, cause: error },
    );
  }
}

function classifyHttpStatus(status: number): LndRestApiErrorKind {
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
  return "lnd-error";
}

function responseSummary(payload: unknown): string {
  if (typeof payload === "object" && payload !== null) {
    const maybe = payload as { message?: unknown; error?: unknown };
    for (const value of [maybe.error, maybe.message]) {
      if (typeof value === "string" && value.trim() !== "") {
        return value;
      }
    }
  }
  return JSON.stringify(payload);
}

function formatUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Strip BOLT 11 invoices and long hex/base64 blobs from outbound error text. */
function redact(value: string): string {
  return value
    .replace(/\b(?:lnbc|lntb|lnbcrt|lnts)[a-z0-9]{40,}\b/gi, "[redacted-bolt11]")
    .replace(/\b[0-9a-f]{64,}\b/gi, "[redacted-credential]")
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, "[redacted-credential]");
}
