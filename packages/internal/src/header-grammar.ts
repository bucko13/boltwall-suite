/**
 * RFC 7235-flavored HTTP `WWW-Authenticate` / `Authorization` parameter grammar.
 *
 * This is a low-level state-machine tokenizer used by `@boltwall/l402` to
 * parse L402 challenge and credential headers without falling into the
 * comma-ambiguity trap of `String.split(",")` (commas appear both as
 * param separators inside one challenge and as challenge separators
 * between dual-scheme challenges, and may also appear inside a
 * quoted-string value once escapes are honored).
 *
 * Spec references:
 * - RFC 7235 §2.1 (challenge grammar, auth-param, token rules)
 * - L402 protocol-specification.md §5.3 (Grammar) — the L402 wire grammar
 *   is RFC 7235-compatible: scheme + 1*SP + comma-separated quoted-string
 *   `name="value"` params.
 * - L402 protocol-specification.md §10 Backwards Compatibility — multiple
 *   challenges (`LSAT` first, `L402` second) MAY be folded into a single
 *   header value separated by `,`.
 *
 * The tokenizer takes a list of `knownSchemes` (case-insensitive) so it
 * can disambiguate "comma followed by next scheme" (challenge boundary)
 * from "comma followed by next param" inside the same challenge.
 */

/** A single `name="value"` pair from a challenge's parameter list. */
export interface AuthParam {
  /** Lowercased parameter name as it appears in the header (e.g. "macaroon"). */
  name: string;
  /** Decoded parameter value with surrounding quotes stripped and `\\X` escapes resolved. */
  value: string;
}

/** A single tokenized challenge: scheme keyword plus its parameter list. */
export interface AuthChallengeToken {
  /** Lowercased scheme keyword (e.g. "l402"). */
  scheme: string;
  /** Parameter list in source order. */
  params: AuthParam[];
}

export interface TokenizeOptions {
  /**
   * Lowercase scheme keywords the caller treats as challenge-starting
   * tokens. Used to detect challenge boundaries after a top-level comma
   * (e.g. `..., L402 macaroon=...`).
   */
  knownSchemes: readonly string[];
}

// RFC 7230 token chars: ALPHA / DIGIT / !#$%&'*+-.^_`|~
const TOKEN_RE = /[A-Za-z0-9!#$%&'*+\-.^_`|~]/;

function isToken(ch: string): boolean {
  return TOKEN_RE.test(ch);
}

function isWs(ch: string | undefined): boolean {
  return ch === " " || ch === "\t";
}

/**
 * Tokenize an HTTP authentication header value into a sequence of
 * `AuthChallengeToken`s. Throws on malformed input. Caller is responsible
 * for pre-trimming and pre-joining any multi-value header arrays.
 *
 * Throws synchronously with a short error code as the message. Scheme and
 * param-name tokens are greedy over RFC 7230 token chars, which decides which
 * code several malformed inputs hit:
 * - `empty-header` — input is empty or whitespace-only
 * - `garbage-data` — where a scheme is expected, the next byte is not a token
 *   char, so no scheme keyword can start (e.g. a leading `"` or `,`)
 * - `scheme-mismatch` — a token keyword was read but is not in `knownSchemes`.
 *   The token is greedy, so `L402macaroon="a"` reads `l402macaroon` as the
 *   scheme and mismatches here rather than failing on the missing space
 * - `expected-sp-after-scheme` — a known scheme is not followed by whitespace,
 *   i.e. it is followed by EOF or a non-token byte such as `"` or `,`
 * - `expected-param-name` — a param name is expected but no token follows
 *   (e.g. a trailing comma, or a comma before EOF)
 * - `expected-equals` — a param name is not followed by `=`; an unknown scheme
 *   after a top-level comma also fails here, since it is parsed as a param name
 * - `expected-quoted-value` — a param value is not a `"`-quoted string
 * - `unterminated-quoted-string` — opened `"` with no closing `"` (a trailing
 *   backslash at EOF does not start an escape)
 * - `expected-comma-or-eof` — after a param value, the next byte is neither
 *   `,` nor end of input
 */
export function tokenizeHttpAuth(
  input: string,
  options: TokenizeOptions,
): AuthChallengeToken[] {
  const knownSchemes = options.knownSchemes.map((s) => s.toLowerCase());
  const n = input.length;
  let i = 0;

  if (n === 0 || /^\s*$/.test(input)) {
    throw new Error("empty-header");
  }

  const skipWs = (): void => {
    while (i < n && isWs(input[i])) {
      i++;
    }
  };

  const peekKnownSchemeAt = (idx: number): boolean => {
    for (const s of knownSchemes) {
      if (idx + s.length > n) {
        continue;
      }
      const slice = input.slice(idx, idx + s.length).toLowerCase();
      if (slice !== s) {
        continue;
      }
      const after = input[idx + s.length];
      if (after === undefined || isWs(after)) {
        return true;
      }
    }
    return false;
  };

  const result: AuthChallengeToken[] = [];

  while (i < n) {
    skipWs();
    if (i >= n) {
      break;
    }

    // Scheme token.
    const schemeStart = i;
    while (i < n) {
      const ch = input[i];
      if (ch === undefined || !isToken(ch)) {
        break;
      }
      i++;
    }
    if (i === schemeStart) {
      throw new Error("garbage-data");
    }
    const scheme = input.slice(schemeStart, i).toLowerCase();
    if (!knownSchemes.includes(scheme)) {
      throw new Error("scheme-mismatch");
    }

    if (!isWs(input[i])) {
      throw new Error("expected-sp-after-scheme");
    }
    skipWs();

    const params: AuthParam[] = [];
    // Param loop. Exits on EOF or on top-level comma followed by a known scheme.
    while (true) {
      const nameStart = i;
      while (i < n) {
        const ch = input[i];
        if (ch === undefined || !isToken(ch)) {
          break;
        }
        i++;
      }
      if (i === nameStart) {
        throw new Error("expected-param-name");
      }
      const name = input.slice(nameStart, i).toLowerCase();

      skipWs();
      if (input[i] !== "=") {
        throw new Error("expected-equals");
      }
      i++;
      skipWs();

      if (input[i] !== '"') {
        throw new Error("expected-quoted-value");
      }
      i++; // consume opening quote
      let value = "";
      let closed = false;
      while (i < n) {
        const ch = input[i];
        if (ch === "\\" && i + 1 < n) {
          // RFC 7230 quoted-pair: backslash escape passes the next byte through verbatim.
          value += input[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') {
          closed = true;
          i++; // consume closing quote
          break;
        }
        value += ch;
        i++;
      }
      if (!closed) {
        throw new Error("unterminated-quoted-string");
      }

      params.push({ name, value });

      skipWs();
      if (i >= n) {
        break;
      }
      if (input[i] !== ",") {
        throw new Error("expected-comma-or-eof");
      }
      i++; // consume comma
      skipWs();
      if (peekKnownSchemeAt(i)) {
        break; // challenge boundary: outer loop will pick up next scheme
      }
    }

    result.push({ scheme, params });
  }

  return result;
}
