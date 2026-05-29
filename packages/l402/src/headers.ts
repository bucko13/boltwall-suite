import { tokenizeHttpAuth } from "@boltwall/internal";

// ---------------------------------------------------------------------------
// Shared scheme type
// ---------------------------------------------------------------------------

/**
 * The two scheme keywords accepted by L402-aware clients and servers.
 *
 * Spec: L402 protocol-specification.md §10 Backwards Compatibility — clients
 * MUST accept both `LSAT` (legacy) and `L402` (current) in incoming headers,
 * and servers SHOULD emit dual challenges with `LSAT` first and `L402`
 * second.
 */
export type L402Scheme = "L402" | "LSAT";

// ---------------------------------------------------------------------------
// WWW-Authenticate challenge — build
// ---------------------------------------------------------------------------

/**
 * Challenge emission compatibility mode for `WWW-Authenticate` header values.
 */
export type AuthenticateHeaderCompatibility = "dual" | "l402-only" | "lsat-only";

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

function buildChallengeValue(scheme: L402Scheme, macaroon: string, invoice: string): string {
  return `${scheme} macaroon="${macaroon}", invoice="${invoice}"`;
}

/**
 * Build one or more `WWW-Authenticate` header values for an L402 payment
 * challenge.
 *
 * L402 protocol-specification.md §5.1 defines the challenge shape as
 * `L402 macaroon="...", invoice="..."`. Section §10 says servers SHOULD send
 * both `LSAT` and `L402` scheme names for backwards compatibility, with the
 * `LSAT` challenge first. This helper therefore defaults to dual LSAT-first
 * emission for server use while retaining explicit L402-only and LSAT-only
 * modes for greenfield deployments, tests, and migrations.
 *
 * @example
 * const headers = buildAuthenticateHeaders({ macaroon, invoice });
 * // → ['LSAT macaroon="...", invoice="..."', 'L402 macaroon="...", invoice="..."']
 *
 * @example
 * buildAuthenticateHeaders({ macaroon, invoice, compatibility: "l402-only" });
 * // → ['L402 macaroon="...", invoice="..."']
 */
export function buildAuthenticateHeaders(args: BuildAuthenticateHeadersArgs): string[] {
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

// ---------------------------------------------------------------------------
// WWW-Authenticate challenge — parse
// ---------------------------------------------------------------------------

/**
 * Structural fields of a single L402 challenge as seen on the wire.
 *
 * `macaroon` and `invoice` are kept as the raw, unquoted string values
 * delivered in the header. Cryptographic / protocol-level decoding is the
 * responsibility of downstream consumers (`decodeIdentifier` for the macaroon,
 * `decodeBolt11Invoice` for the invoice).
 */
export interface L402ChallengeFields {
  scheme: L402Scheme;
  /** Base64-encoded macaroon as it appeared on the wire (may be empty for spec example shapes). */
  macaroon: string;
  /** BOLT 11 invoice string as it appeared on the wire (may be empty for spec example shapes). */
  invoice: string;
}

const KNOWN_SCHEMES = ["l402", "lsat"] as const;

// RFC 4648 §4 base64 alphabet (`+/`) with optional `=` padding.
// Also tolerated: empty string, since the spec's §5.1 minimal example shows
// `macaroon=""`. Deeper validation (binary decode, version byte, identifier
// length) is the macaroon decoder's job.
const BASE64_ALPHABET = /^[A-Za-z0-9+/]*={0,2}$/;

// BOLT 11 §3 human-readable prefix: `lnbc` (mainnet), `lntb` (testnet),
// `lnbcrt` (regtest), `lnsb` (signet). Empty is tolerated for the same
// reason as the macaroon: spec §5.1 minimal-empty form.
const INVOICE_HRP = /^ln(bcrt|bc|tb|sb)/i;

/**
 * Parse a `WWW-Authenticate` challenge header into its L402 fields.
 *
 * Accepts either a single header value, an array of values (HTTP allows the
 * same header to appear multiple times), or a comma-folded single string.
 * Multiple challenges are split on top-level commas where the next token is
 * a known scheme keyword (`L402` or `LSAT`, case-insensitive); commas
 * inside quoted-string param values do not split.
 *
 * Spec citations:
 * - L402 protocol-specification.md §5 / §5.1 / §5.3 — challenge form,
 *   required `macaroon` and `invoice` parameters as quoted strings, and the
 *   `1*SP` separator after the scheme keyword.
 * - L402 protocol-specification.md §10 — dual `LSAT`/`L402` emission for
 *   backwards compatibility; servers send both, clients accept either.
 *
 * Validation scope (deliberately narrow):
 * 1. Scheme keyword MUST be `L402` or `LSAT` (case-insensitive); other
 *    schemes (`Bearer`, `Basic`, ...) throw `scheme-mismatch`.
 * 2. Each challenge MUST contain `macaroon` and `invoice` params; missing
 *    or unexpected param names throw with a specific reason.
 * 3. Non-empty `macaroon` values MUST match the base64 alphabet; non-empty
 *    `invoice` values MUST start with a BOLT 11 human-readable prefix
 *    (`lnbc`, `lntb`, `lnbcrt`, `lnsb`). Anything past these cheap shape
 *    checks (binary macaroon validity, BOLT 11 amount/expiry/signature) is
 *    the responsibility of `decodeIdentifier` / `decodeBolt11Invoice`.
 *
 * Throws synchronously on malformed input. Error messages are short
 * machine-readable codes:
 * `empty-header`, `garbage-data`, `scheme-mismatch`, `missing-macaroon`,
 * `missing-invoice`, `unexpected-param`, `invalid-macaroon-base64`,
 * `invalid-invoice`, plus the lower-level grammar errors surfaced by the
 * tokenizer (`expected-sp-after-scheme`, `expected-quoted-value`, ...).
 *
 * @example
 * parseAuthenticateHeader('L402 macaroon="AGIAJEemVQ==", invoice="lnbc1500n1..."');
 * // → [{ scheme: "L402", macaroon: "AGIAJEemVQ==", invoice: "lnbc1500n1..." }]
 *
 * @example
 * parseAuthenticateHeader([
 *   'LSAT macaroon="...", invoice="lnbc..."',
 *   'L402 macaroon="...", invoice="lnbc..."',
 * ]);
 * // → [{ scheme: "LSAT", ... }, { scheme: "L402", ... }]
 */
export function parseAuthenticateHeader(header: string | string[]): L402ChallengeFields[] {
  const merged = Array.isArray(header) ? header.join(", ") : header;

  if (merged.trim().length === 0) {
    throw new Error("empty-header");
  }

  const tokens = tokenizeHttpAuth(merged, { knownSchemes: KNOWN_SCHEMES });

  return tokens.map((t) => {
    const scheme: L402Scheme = t.scheme === "lsat" ? "LSAT" : "L402";

    let macaroon: string | undefined;
    let invoice: string | undefined;
    for (const p of t.params) {
      if (p.name === "macaroon") {
        macaroon = p.value;
      } else if (p.name === "invoice") {
        invoice = p.value;
      } else {
        throw new Error("unexpected-param");
      }
    }

    if (macaroon === undefined) {
      throw new Error("missing-macaroon");
    }
    if (invoice === undefined) {
      throw new Error("missing-invoice");
    }
    if (macaroon.length > 0 && !BASE64_ALPHABET.test(macaroon)) {
      throw new Error("invalid-macaroon-base64");
    }
    if (invoice.length > 0 && !INVOICE_HRP.test(invoice)) {
      throw new Error("invalid-invoice");
    }

    return { scheme, macaroon, invoice };
  });
}

// ---------------------------------------------------------------------------
// Authorization credential — build
// ---------------------------------------------------------------------------

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

function normalizeBuildMacaroons(macaroons: string | string[]): string[] {
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
 * `<scheme> <macaroon[,macaroon...]>:<preimage-hex>`. This helper emits `L402`
 * by default for new clients. Passing `legacy: true` emits `LSAT`, matching the
 * legacy `Lsat#toToken()` scheme keyword so the compatibility facade can
 * preserve that migration path.
 *
 * @example
 * buildAuthorizationHeader({ macaroons: macaroonB64, preimage: preimageHex });
 * // → "L402 <macaroon>:<preimage>"
 *
 * @example
 * buildAuthorizationHeader({ macaroons: [m1, m2], preimage, legacy: true });
 * // → "LSAT <m1>,<m2>:<preimage>"
 */
export function buildAuthorizationHeader(args: BuildAuthorizationHeaderArgs): string {
  const scheme = args.legacy === true ? "LSAT" : "L402";
  const macaroons = normalizeBuildMacaroons(args.macaroons).join(",");

  return `${scheme} ${macaroons}:${args.preimage}`;
}

// ---------------------------------------------------------------------------
// Authorization credential — parse
// ---------------------------------------------------------------------------

/**
 * Structural fields of an L402 credential as carried in the `Authorization`
 * request header.
 *
 * `macaroons` is always an array, even when the credential carries a single
 * macaroon (length 1 in that case). Per L402 protocol-specification.md §5 the
 * wire grammar is `<scheme> M1[,M2,...]:<preimage-hex>`, where the preimage
 * binds to one macaroon in the list — verifiers MUST iterate.
 *
 * The single-macaroon case is therefore a special case of the multi case; we
 * keep the common shape so downstream verification code does not have to handle
 * two different return types.
 */
export interface L402CredentialFields {
  scheme: L402Scheme;
  /** One or more base64-encoded macaroons in source order. Length ≥ 1. */
  macaroons: string[];
  /** 64-char hex-encoded payment preimage (32 bytes), or `""` for HODL pending settlement. */
  preimage: string;
}

/**
 * Options that relax strict L402 Authorization parsing for pending-settlement
 * migration flows.
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
 * Throws synchronously with a short machine-readable code on malformed input:
 * `empty-header`, `missing-scheme`, `scheme-mismatch`, `missing-colon`,
 * `empty-macaroons`, `empty-macaroon`, `invalid-macaroon-base64`,
 * `invalid-preimage-length`, `invalid-preimage-hex`,
 * `invalid-credential-whitespace`.
 *
 * @example
 * parseAuthorizationHeader("L402 <macaroon>:<preimage-hex>");
 * // → { scheme: "L402", macaroons: ["<macaroon>"], preimage: "<preimage-hex>" }
 *
 * @example
 * parseAuthorizationHeader("L402 <macaroon>:", { allowEmptyPreimage: true });
 * // → { scheme: "L402", macaroons: ["<macaroon>"], preimage: "" }
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
  const scheme: L402Scheme = schemeRaw.toUpperCase() === "LSAT" ? "LSAT" : "L402";

  // The preimage is hex (no `:` in the alphabet) and macaroons are base64
  // (no `:` in the alphabet either, since `+/=` are the only non-alnum
  // chars). So splitting on the LAST colon is safe and unambiguous.
  const lastColon = body.lastIndexOf(":");
  if (lastColon < 0) {
    throw new Error("missing-colon");
  }
  const macaroonsPart = body.slice(0, lastColon);
  const preimagePart = body.slice(lastColon + 1).trim();

  const macaroons = macaroonsPart.split(",").map((m) => m.trim());

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
