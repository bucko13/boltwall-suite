import type { Caveat } from "../caveats";
import type { CaveatSatisfier } from "../satisfiers";

/**
 * Builds the legacy `expiration=<unix-ms>` caveat used by older LSAT clients.
 *
 * @deprecated Use `validUntilSatisfier` from `@boltwall/l402` with a standard
 * ISO-8601 `valid-until` caveat instead. This helper exists only for
 * migration compatibility with legacy LSAT-style macaroons.
 */
export function expirationCaveat(unixMs: number): Caveat {
  if (!Number.isFinite(unixMs)) {
    throw new Error("invalid-expiration");
  }

  return {
    condition: "expiration",
    value: String(unixMs),
  };
}

/**
 * Verifies the legacy `expiration=<unix-ms>` caveat used by older LSAT clients.
 *
 * L402 macaroon-spec.md §Caveat Format and §Verification define caveats as
 * `condition=value` strings evaluated by registered satisfiers. This satisfier
 * is intentionally kept under the legacy subpath because current L402 code
 * should prefer the standard `valid-until` caveat shape.
 *
 * @deprecated Use `validUntilSatisfier` from `@boltwall/l402`. This helper is
 * migration-only and should not be used by new protocol code.
 */
export function expirationSatisfier(): CaveatSatisfier {
  return {
    condition: "expiration",
    satisfyPrevious(previous, next) {
      return parseExpirationUnixMs(next.value) <= parseExpirationUnixMs(previous.value);
    },
    satisfyFinal(caveat, context) {
      const now = context.now ?? new Date();
      return now.getTime() < parseExpirationUnixMs(caveat.value);
    },
  };
}

function parseExpirationUnixMs(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error("invalid-expiration");
  }

  const unixMs = Number(value);
  if (!Number.isSafeInteger(unixMs)) {
    throw new Error("invalid-expiration");
  }

  return unixMs;
}
