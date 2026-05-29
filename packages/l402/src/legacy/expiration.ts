import { Caveat } from "../caveats";
import type { CaveatSatisfier } from "../satisfiers";

/**
 * Builds the `expiration=<unix-ms>` compatibility caveat used by older LSAT clients.
 *
 * New L402 macaroons should use a standard ISO-8601 `valid-until` caveat
 * instead. This helper preserves migration compatibility with LSAT-style
 * macaroons while being exported from the primary `@boltwall/l402` API.
 */
export function expirationCaveat(unixMs: number): Caveat {
  if (!Number.isFinite(unixMs)) {
    throw new Error("invalid-expiration");
  }

  return new Caveat("expiration", String(unixMs));
}

/**
 * Verifies the `expiration=<unix-ms>` compatibility caveat used by older LSAT clients.
 *
 * L402 macaroon-spec.md §Caveat Format and §Verification define caveats as
 * `condition=value` strings evaluated by registered satisfiers. This satisfier
 * exists for LSAT compatibility; current L402 code should prefer the standard
 * `valid-until` caveat shape for new macaroons.
 *
 * L402 protocol-specification.md §10 requires accepting legacy LSAT
 * credentials. Register this satisfier when verifying imported macaroons that
 * carry `expiration` caveats.
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
