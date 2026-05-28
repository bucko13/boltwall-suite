import type { L402Scheme } from "./parse-authenticate-header";

/**
 * Structural fields of an L402 credential as carried in the
 * `Authorization` request header.
 *
 * `macaroons` is always an array, even when the credential carries a single
 * macaroon (length 1 in that case). Per L402 protocol-specification.md §5
 * the wire grammar is `<scheme> M1[,M2,...]:<preimage-hex>`, where the
 * preimage binds to one macaroon in the list — verifiers MUST iterate.
 *
 * The single-macaroon case is therefore a special case of the multi case;
 * we keep the common shape so downstream verification code does not have to
 * handle two different return types.
 */
export interface L402CredentialFields {
  scheme: L402Scheme;
  /** One or more base64-encoded macaroons in source order. Length ≥ 1. */
  macaroons: string[];
  /** 64-char hex-encoded payment preimage (32 bytes), or `""` for HODL pending settlement. */
  preimage: string;
}

/**
 * Options that relax strict L402 Authorization parsing for
 * pending-settlement migration flows.
 */
export interface ParseAuthorizationHeaderOptions {
  /**
   * Accept the HODL pending-settlement token shape `LSAT/L402 <macaroon>:`
   * while the invoice is held and the client has not disclosed the preimage.
   *
   * Defaults to `false`; L402 protocol-specification.md §5.2/§5.3 requires a
   * 32-byte preimage for standard L402/LSAT authorization.
   */
  allowEmptyPreimage?: boolean;
}

const SCHEME_RE = /^(L402|LSAT)$/i;
const HEX_64_RE = /^[0-9a-fA-F]{64}$/;
// RFC 4648 §4 base64 alphabet, with optional `=` padding.
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

/**
 * Parse an L402 / LSAT `Authorization` header value into its credential
 * fields. Multi-macaroon credentials are first-class: a single trailing
 * `:<preimage-hex>` separator splits the macaroon list (one or more,
 * comma-separated) from the preimage hex.
 *
 * Spec citations:
 * - L402 protocol-specification.md §5.3 Grammar — Authorization credentials:
 *   `<scheme> <macaroons-csv>:<preimage-hex>`, preimage = 32 bytes hex.
 * - L402 protocol-specification.md §10 Backwards Compatibility — incoming
 *   `LSAT` scheme keyword MUST be accepted alongside `L402`.
 *
 * Throws synchronously with a short machine-readable code on malformed
 * input: `empty-header`, `missing-scheme`, `scheme-mismatch`,
 * `missing-colon`, `empty-macaroons`, `empty-macaroon`,
 * `invalid-macaroon-base64`, `invalid-preimage-length`,
 * `invalid-preimage-hex`.
 */
export function parseAuthorizationHeader(
  header: string,
  options: ParseAuthorizationHeaderOptions = {},
): L402CredentialFields {
  if (header.trim().length === 0) {
    throw new Error("empty-header");
  }

  // L402 protocol-specification.md §5.3 Grammar: scheme keyword + 1*SP +
  // credential body. Whitespace inside the credential body is not part of
  // macaroon CSV or preimage hex grammar and is rejected before tokenization.
  const trimmed = header.trim();
  const firstSpace = /\s/.exec(trimmed);
  if (firstSpace === null) {
    throw new Error("missing-scheme");
  }
  const schemeRaw = trimmed.slice(0, firstSpace.index);
  const body = trimmed.slice(firstSpace.index).trim();
  if (/\s/.test(body)) {
    throw new Error("invalid-credential-whitespace");
  }

  const schemeMatch = SCHEME_RE.exec(schemeRaw);
  if (schemeMatch === null) {
    throw new Error("scheme-mismatch");
  }
  const scheme: L402Scheme =
    schemeRaw.toUpperCase() === "LSAT" ? "LSAT" : "L402";

  // The preimage is hex (no `:` in the alphabet) and macaroons are base64
  // (no `:` in the alphabet either, since `+/=` are the only non-alnum
  // chars). So splitting on the LAST colon is safe and unambiguous.
  const lastColon = body.lastIndexOf(":");
  if (lastColon < 0) {
    throw new Error("missing-colon");
  }
  const macaroonsPart = body.slice(0, lastColon);
  const preimagePart = body.slice(lastColon + 1).trim();

  const macaroons = macaroonsPart
    .split(",")
    .map((m) => m.trim());

  if (macaroons.length === 0 || (macaroons.length === 1 && macaroons[0] === "")) {
    throw new Error("empty-macaroons");
  }
  for (const m of macaroons) {
    if (m.length === 0) {
      throw new Error("empty-macaroon");
    }
    if (!BASE64_ALPHABET.test(m)) {
      throw new Error("invalid-macaroon-base64");
    }
  }

  if (preimagePart.length === 0 && options.allowEmptyPreimage === true) {
    return { scheme, macaroons, preimage: "" };
  }
  if (preimagePart.length !== 64) {
    throw new Error("invalid-preimage-length");
  }
  if (!HEX_64_RE.test(preimagePart)) {
    throw new Error("invalid-preimage-hex");
  }

  return { scheme, macaroons, preimage: preimagePart };
}
