import { L402 } from "@boltwall/l402";

/**
 * The three L402 artifact forms a user can paste into a panel: a bare base64
 * `macaroon`, a `challenge` (`WWW-Authenticate` header value), or a `credential`
 * (`Authorization` header value, `L402 <macaroon>:<preimage>`).
 */
export type ArtifactKind = "macaroon" | "challenge" | "credential";

/** A successfully recognized and parsed artifact. */
export interface DetectedArtifact {
  /** Which artifact form the input was recognized as. */
  kind: ArtifactKind;
  /** The parsed token — use it to read caveats, attenuate, or convert. */
  token: L402;
  /** The base64 macaroon carried by the artifact. */
  macaroon: string;
}

/** A recognized-but-unparseable (or empty) input. */
export interface RejectedArtifact {
  /** Best guess at the intended form, or `"empty"` for blank input. */
  kind: ArtifactKind | "empty";
  /**
   * Low-level parser reason (e.g. `"expected-equals"`, `"empty-macaroons"`).
   * Pass to {@link describeArtifactError} for a human-facing message.
   */
  reason: string;
}

/** Result of {@link detectArtifact}: either a parsed artifact or a rejection. */
export type DetectArtifactResult =
  | { ok: true; value: DetectedArtifact }
  | { ok: false; error: RejectedArtifact };

const WWW_AUTHENTICATE_PREFIX = /^WWW-Authenticate:\s*/i;
const AUTHORIZATION_PREFIX = /^Authorization:\s*/i;

function stripChallengePrefix(input: string): string {
  return input.replace(WWW_AUTHENTICATE_PREFIX, "").trim();
}

function stripAuthorizationPrefix(input: string): string {
  return input.replace(AUTHORIZATION_PREFIX, "").trim();
}

/** A challenge advertises `macaroon=...` params under an `L402`/`LSAT` scheme. */
function looksLikeChallenge(input: string): boolean {
  return /^(WWW-Authenticate:\s*)?(L402|LSAT)\s+macaroon=/i.test(input.trim());
}

/**
 * A credential is `L402 <macaroon>:<preimage>` — a scheme followed by a token,
 * with no `macaroon=` parameter (which is what distinguishes it from a challenge).
 */
function looksLikeCredential(input: string): boolean {
  const normalized = stripAuthorizationPrefix(input);
  return /^(L402|LSAT)\s+/i.test(normalized) && !/\bmacaroon=/i.test(normalized);
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Guess which artifact form an input is, without parsing it. Useful for routing
 * UI before a parse attempt; the fallback for anything not header-shaped is
 * `"macaroon"` (a bare token), matching {@link detectArtifact}.
 *
 * @example
 * detectArtifactKind("L402 macaroon=\"AGIA...\", invoice=\"lnbc...\""); // "challenge"
 * detectArtifactKind("L402 AGIA...:9f86d0..."); // "credential"
 * detectArtifactKind("AGIAJEem..."); // "macaroon"
 * detectArtifactKind(""); // "empty"
 */
export function detectArtifactKind(input: string): ArtifactKind | "empty" {
  const trimmed = input.trim();
  if (!trimmed) return "empty";
  if (looksLikeChallenge(trimmed)) return "challenge";
  if (looksLikeCredential(trimmed)) return "credential";
  return "macaroon";
}

/**
 * Auto-detect and parse any of the three L402 artifact forms from a single
 * input. Tries challenge, then credential, then a bare macaroon — header
 * prefixes (`WWW-Authenticate:` / `Authorization:`) are tolerated and stripped.
 *
 * On success the returned `token` is a parsed {@link L402} (caveats, attenuation,
 * and conversion all hang off it). On failure the `kind` reflects the detected
 * intent so callers can show a form-specific message via
 * {@link describeArtifactError}.
 *
 * @example
 * const result = detectArtifact(userInput);
 * if (result.ok) {
 *   const { kind, token, macaroon } = result.value;
 *   const caveats = token.getCaveats();
 * } else {
 *   setError(describeArtifactError(result.error));
 * }
 */
export function detectArtifact(input: string): DetectArtifactResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: { kind: "empty", reason: "empty" } };

  if (looksLikeChallenge(trimmed)) {
    try {
      const token = L402.fromHeader(stripChallengePrefix(trimmed));
      return { ok: true, value: { kind: "challenge", token, macaroon: token.macaroon } };
    } catch (error) {
      return { ok: false, error: { kind: "challenge", reason: reasonOf(error) } };
    }
  }

  if (looksLikeCredential(trimmed)) {
    try {
      const token = L402.fromToken(stripAuthorizationPrefix(trimmed));
      return { ok: true, value: { kind: "credential", token, macaroon: token.macaroon } };
    } catch (error) {
      return { ok: false, error: { kind: "credential", reason: reasonOf(error) } };
    }
  }

  try {
    const token = L402.fromMacaroon(trimmed);
    return { ok: true, value: { kind: "macaroon", token, macaroon: trimmed } };
  } catch (error) {
    return { ok: false, error: { kind: "macaroon", reason: reasonOf(error) } };
  }
}

/**
 * Turn a {@link RejectedArtifact} into a human-facing message. Low-level codec
 * reasons (e.g. `expected-equals` from the header tokenizer) are opaque to users,
 * so this maps the detected `kind` to a clear, form-specific explanation.
 *
 * @example
 * const result = detectArtifact("L402 AGIA...:bad");
 * if (!result.ok) setError(describeArtifactError(result.error));
 * // -> "That doesn't look like a valid L402 credential (Authorization header)."
 */
export function describeArtifactError(error: RejectedArtifact): string {
  switch (error.kind) {
    case "empty":
      return "Paste a macaroon, an L402 challenge, or a credential.";
    case "challenge":
      return "That doesn't look like a valid L402 challenge (WWW-Authenticate header).";
    case "credential":
      return "That doesn't look like a valid L402 credential (Authorization header).";
    case "macaroon":
      return "That doesn't look like a valid base64 macaroon.";
  }
}
