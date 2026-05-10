/**
 * Challenge emission compatibility mode for `WWW-Authenticate` header values.
 */
export type AuthenticateHeaderCompatibility =
  | "dual"
  | "l402-only"
  | "lsat-only";

/**
 * Inputs for server-side L402 challenge header construction.
 */
export interface BuildAuthenticateHeadersArgs {
  /** Base64-encoded macaroon to place in the `macaroon` challenge parameter. */
  macaroon: string;
  /** BOLT 11 payment request to place in the `invoice` challenge parameter. */
  invoice: string;
  /**
   * Challenge compatibility mode.
   *
   * Defaults to `"dual"` so servers emit legacy `LSAT` first and current
   * `L402` second, as recommended by L402 protocol-specification.md §10.
   */
  compatibility?: AuthenticateHeaderCompatibility;
}

function buildChallengeValue(
  scheme: "L402" | "LSAT",
  macaroon: string,
  invoice: string,
): string {
  return `${scheme} macaroon="${macaroon}", invoice="${invoice}"`;
}

/**
 * Build one or more `WWW-Authenticate` header values for an L402 payment
 * challenge.
 *
 * L402 protocol-specification.md §5.1 defines the challenge shape as
 * `L402 macaroon="...", invoice="..."`. Section §10 says servers SHOULD
 * send both `LSAT` and `L402` scheme names for backwards compatibility, with
 * the `LSAT` challenge first. This helper therefore defaults to dual
 * LSAT-first emission for server use while retaining explicit L402-only and
 * LSAT-only modes for greenfield deployments, tests, and migrations.
 */
export function buildAuthenticateHeaders(
  args: BuildAuthenticateHeadersArgs,
): string[] {
  const compatibility = args.compatibility ?? "dual";

  if (compatibility === "l402-only") {
    return [buildChallengeValue("L402", args.macaroon, args.invoice)];
  }
  if (compatibility === "lsat-only") {
    return [buildChallengeValue("LSAT", args.macaroon, args.invoice)];
  }

  return [
    buildChallengeValue("LSAT", args.macaroon, args.invoice),
    buildChallengeValue("L402", args.macaroon, args.invoice),
  ];
}
