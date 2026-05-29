/**
 * L402Error — discriminated error model for the L402 middleware.
 *
 * Status mapping (L402 protocol-specification.md §5 Challenge / §6 Authorization):
 *   402  — payment-required: credential is ABSENT. Emit WWW-Authenticate challenge.
 *   401  — invalid-credential / invalid-preimage / caveat-rejected: credential is
 *          PRESENT but invalid. The spec requires 401 here, not 402.
 *   502  — invoice-provider-failure: Lightning backend errored during invoice creation
 *          or lookup. Gateway error; the client cannot fix this by retrying.
 */

export type L402ErrorKind =
  /** Credential absent — emit 402 + WWW-Authenticate challenge. */
  | "payment-required"
  /** Credential present but unparseable or wrong scheme — 401. */
  | "invalid-credential"
  /** Preimage fails sha256(preimage) == paymentHash check — 401. */
  | "invalid-preimage"
  /** A satisfier rejected a caveat — 401. */
  | "caveat-rejected"
  /** Lightning backend returned an error during invoice ops — 502. */
  | "invoice-provider-failure"
  /** Request cannot create a valid L402 challenge — 400. */
  | "bad-request";

export interface L402ErrorOptions {
  cause?: unknown;
  /**
   * HTTP response headers to forward to the client.
   * For payment-required errors this carries the WWW-Authenticate value(s).
   */
  headers?: Record<string, string | string[]>;
}

export class L402Error extends Error {
  readonly kind: L402ErrorKind;
  override readonly cause: unknown;
  readonly headers: Record<string, string | string[]> | undefined;

  /**
   * Construct a discriminated L402 error carrying the `kind` that drives the
   * HTTP status (via {@link l402ErrorToStatus}) and any response headers.
   *
   * Pass `opts.headers` only for `payment-required` — it carries the
   * WWW-Authenticate challenge that the gate copies onto the 402 response;
   * other kinds map to error statuses with no challenge.
   *
   * @example
   * ```ts
   * const challenge = 'LSAT macaroon="AGIAJEemVQU...", invoice="lnbc1..."';
   * throw new L402Error("payment-required", "credential absent", {
   *   headers: { "WWW-Authenticate": challenge },
   * });
   * ```
   */
  constructor(kind: L402ErrorKind, message: string, opts: L402ErrorOptions = {}) {
    super(message);
    this.name = "L402Error";
    this.kind = kind;
    this.cause = opts.cause;
    this.headers = opts.headers;
  }
}

/**
 * Map an L402ErrorKind to the correct HTTP status code.
 *
 * L402 protocol-specification.md §5 — 402 is for the INITIAL missing-credential
 * challenge only. Credential present but invalid → 401. Backend failure → 502.
 */
export function l402ErrorToStatus(kind: L402ErrorKind): number {
  switch (kind) {
    case "payment-required":
      return 402;
    case "invalid-credential":
    case "invalid-preimage":
    case "caveat-rejected":
      return 401;
    case "invoice-provider-failure":
      return 502;
    case "bad-request":
      return 400;
  }
}
