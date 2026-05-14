/**
 * Stable runtime strings and a template-aware union type for L402 macaroon
 * verification failures.
 *
 * Const objects (not TypeScript enums) keep runtime values stable across ESM
 * bundling and let downstream packages compare values without hard-coding
 * string literals.
 *
 * L402 macaroon-spec.md §Verification — the failure reasons exposed here
 * cover the verification steps (HMAC chain, preimage binding, caveat
 * evaluation) that `verifyMacaroon` performs.
 */

/**
 * Stable, exported runtime strings for L402 macaroon verification failure
 * reasons that do not carry a per-condition suffix.
 *
 * Compare against `VerificationFailureReason.X` rather than the underlying
 * string literal. The runtime values are guaranteed stable; the keys are
 * presentational and may evolve.
 */
export const VerificationFailureReason = {
  /** HMAC signature did not validate against the server-side root key. */
  SignatureInvalid: "signature-invalid",
  /** No root key was found for the macaroon's v0 identifier `token_id`. */
  UnknownToken: "unknown-token",
  /** Preimage does not match the macaroon's embedded payment hash. */
  PreimageMismatch: "preimage-mismatch",
} as const;

/**
 * Prefixes for the template-form verification failure reasons.
 *
 * `CaveatRejected` carries the caveat condition (e.g. `caveat-rejected:expiration`).
 * `UnknownCaveat` carries the unmatched condition when `strictUnknownCaveats`
 * is enabled (e.g. `unknown-caveat:foo`).
 */
export const VerificationFailurePrefix = {
  CaveatRejected: "caveat-rejected:",
  UnknownCaveat: "unknown-caveat:",
} as const;

/**
 * Union of every reason value `verifyMacaroon` may return in a failed result,
 * including the per-condition template variants.
 *
 * Downstream code mapping failures to user-facing errors should switch on
 * `VerificationFailureReason` constants for the fixed cases and use
 * `String#startsWith(VerificationFailurePrefix.X)` for the template cases.
 */
export type VerificationFailureReasonValue =
  | (typeof VerificationFailureReason)[keyof typeof VerificationFailureReason]
  | `${typeof VerificationFailurePrefix.CaveatRejected}${string}`
  | `${typeof VerificationFailurePrefix.UnknownCaveat}${string}`;
