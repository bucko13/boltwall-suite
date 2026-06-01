/**
 * Discriminated error model for the L402 middleware.
 *
 * Status mapping ([L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
 * §5 Challenge / §6 Authorization):
 *   402: payment-required, credential is absent and the response carries a
 *        `WWW-Authenticate` challenge.
 *   401: invalid-credential, invalid-preimage, or caveat-rejected. The
 *        credential is present but invalid.
 *   502: invoice-provider-failure. The Lightning backend failed during invoice
 *        creation or lookup.
 */

export type L402ErrorKind =
  /** Credential absent. Emit 402 with a `WWW-Authenticate` challenge. */
  | "payment-required"
  /** Credential present but unparseable or wrong scheme. */
  | "invalid-credential"
  /** Preimage fails the `sha256(preimage) == paymentHash` check. */
  | "invalid-preimage"
  /** A satisfier rejected a caveat. */
  | "caveat-rejected"
  /** Lightning backend returned an error during invoice operations. */
  | "invoice-provider-failure"
  /** Request cannot create a valid L402 challenge. */
  | "bad-request";

export interface L402ErrorOptions {
  /** Original error or thrown value, when one exists. */
  cause?: unknown;
  /**
   * HTTP response headers to forward to the client.
   * For payment-required errors this carries the WWW-Authenticate value(s).
   */
  headers?: Record<string, string | string[]>;
}

export class L402Error extends Error {
  /** Stable error kind used for HTTP status mapping. */
  readonly kind: L402ErrorKind;
  /** Original error or thrown value, when one exists. */
  override readonly cause: unknown;
  /** Response headers to forward, usually `WWW-Authenticate` on 402. */
  readonly headers: Record<string, string | string[]> | undefined;

  /**
   * Construct a discriminated L402 error carrying the `kind` that drives the
   * HTTP status (via {@link l402ErrorToStatus}) and any response headers.
   *
   * Pass `opts.headers` only for `payment-required`; it carries the
   * WWW-Authenticate challenge that the gate copies onto the 402 response;
   * other kinds map to error statuses with no challenge.
   *
   * @param kind - Stable error kind.
   * @param message - Human-readable message for logs and tests.
   * @param opts - Optional cause and response headers.
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
 * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
 * §5: 402 is for the initial missing-credential challenge only. Credential
 * present but invalid returns 401. Backend failure returns 502.
 *
 * @param kind - Middleware error kind to map.
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
