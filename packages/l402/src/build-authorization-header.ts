/**
 * Inputs for client-side L402 credential serialization into an
 * `Authorization` header value.
 */
export interface BuildAuthorizationHeaderArgs {
  /**
   * One or more base64-encoded macaroons. Arrays are serialized as a
   * comma-separated list with no whitespace, matching the L402 credential
   * grammar.
   */
  macaroons: string | string[];
  /** Hex-encoded payment preimage. */
  preimage: string;
  /**
   * Emit the legacy `LSAT` scheme keyword instead of the default current
   * `L402` keyword.
   */
  legacy?: boolean;
}

function normalizeMacaroons(macaroons: string | string[]): string[] {
  const normalized = Array.isArray(macaroons) ? macaroons : [macaroons];

  if (normalized.length === 0) {
    throw new Error("empty-macaroons: provide at least one macaroon");
  }
  for (const macaroon of normalized) {
    if (macaroon.length === 0) {
      throw new Error("empty-macaroon: macaroon entries must be non-empty");
    }
  }

  return normalized;
}

/**
 * Build an L402 / LSAT `Authorization` header value for a paid retry.
 *
 * L402 protocol-specification.md §5.2 / §5.3 defines credentials as
 * `<scheme> <macaroon[,macaroon...]>:<preimage-hex>`. This helper emits
 * `L402` by default for new clients. Passing `legacy: true` emits `LSAT`,
 * matching the legacy `Lsat#toToken()` scheme keyword so the compatibility
 * facade can preserve that migration path.
 */
export function buildAuthorizationHeader(
  args: BuildAuthorizationHeaderArgs,
): string {
  const scheme = args.legacy === true ? "LSAT" : "L402";
  const macaroons = normalizeMacaroons(args.macaroons).join(",");

  return `${scheme} ${macaroons}:${args.preimage}`;
}
