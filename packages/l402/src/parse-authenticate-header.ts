import { tokenizeHttpAuth } from "@boltwall/internal";

/**
 * The two scheme keywords accepted by L402-aware clients and servers.
 *
 * Spec: L402 protocol-specification.md §10 Backwards Compatibility — clients
 * MUST accept both `LSAT` (legacy) and `L402` (current) in incoming headers,
 * and servers SHOULD emit dual challenges with `LSAT` first and `L402`
 * second.
 */
export type L402Scheme = "L402" | "LSAT";

/**
 * Structural fields of a single L402 challenge as seen on the wire.
 *
 * `macaroon` and `invoice` are kept as the raw, unquoted string values
 * delivered in the header. Cryptographic / protocol-level decoding is the
 * responsibility of downstream consumers (`decodeIdentifier` for the
 * macaroon, `decodeBolt11Invoice` for the invoice).
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
export function parseAuthenticateHeader(
  header: string | string[],
): L402ChallengeFields[] {
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
