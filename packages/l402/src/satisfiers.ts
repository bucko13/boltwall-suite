import type { Caveat } from "./caveats";

/**
 * Request-scoped data available to caveat satisfiers during final verification.
 *
 * `request` is the Web Fetch API request used by origin and route checks.
 * `now` lets callers inject a deterministic clock for `valid-until`.
 * `clientIp` lets server adapters pass a trusted client IP from their own
 * request metadata when it is not represented in Fetch headers.
 */
export interface CaveatContext {
  request?: Request;
  now?: Date;
  clientIp?: string;
}

/**
 * Verifies one known caveat condition.
 *
 * `satisfyPrevious` enforces attenuation between repeated caveats with the
 * same condition. `satisfyFinal` decides whether the request context satisfies
 * the final caveat value.
 */
export interface CaveatSatisfier {
  condition: string | RegExp;
  satisfyPrevious?(previous: Caveat, next: Caveat): boolean;
  satisfyFinal(caveat: Caveat, context: CaveatContext): boolean | Promise<boolean>;
}

interface ServiceCaveatEntry {
  name: string;
  tier: number;
}

/**
 * Creates a satisfier for the `services` caveat.
 *
 * L402 macaroon-spec.md §Caveat Format and §Verification define caveats as
 * `condition=value` strings evaluated by registered satisfiers. Unknown
 * caveats are skipped by the verifier; these factories represent known
 * caveats that middleware opts into explicitly.
 *
 * The value is parsed as `name:tier[,name:tier...]`. Final verification passes
 * when `targetService` is present with a non-negative tier; attenuation only
 * allows later services caveats to be exact subsets of earlier ones.
 */
export function servicesSatisfier(targetService: string): CaveatSatisfier {
  return {
    condition: "services",
    satisfyPrevious(previous, next) {
      const previousServices = parseServicesValue(previous.value);
      const nextServices = parseServicesValue(next.value);
      return isServiceSubset(nextServices, previousServices);
    },
    satisfyFinal(caveat) {
      return parseServicesValue(caveat.value).some(
        (service) => service.name === targetService && service.tier >= 0,
      );
    },
  };
}

/**
 * Creates a satisfier for a service-specific capabilities caveat.
 *
 * The caveat condition is `<service>_capabilities`, with comma-separated
 * capability names. Final verification requires `requiredCapability`;
 * attenuation only allows later capability lists to be subsets of earlier ones.
 */
export function capabilitiesSatisfier(
  service: string,
  requiredCapability: string,
): CaveatSatisfier {
  return {
    condition: `${service}_capabilities`,
    satisfyPrevious(previous, next) {
      return isStringSubset(parseCsvValue(next.value), parseCsvValue(previous.value));
    },
    satisfyFinal(caveat) {
      return parseCsvValue(caveat.value).includes(requiredCapability);
    },
  };
}

/**
 * Creates a satisfier for the `valid-until` caveat.
 *
 * The value is an ISO-8601 timestamp. Final verification requires the current
 * time to be strictly earlier than the timestamp; attenuation may shorten
 * validity but never extend it.
 */
export function validUntilSatisfier(): CaveatSatisfier {
  return {
    condition: "valid-until",
    satisfyPrevious(previous, next) {
      const previousTime = parseTimestamp(previous.value);
      const nextTime = parseTimestamp(next.value);
      return nextTime <= previousTime;
    },
    satisfyFinal(caveat, context) {
      const now = context.now ?? new Date();
      return now.getTime() < parseTimestamp(caveat.value);
    },
  };
}

/**
 * Creates a satisfier for the `expiration` caveat.
 *
 * The value is a Unix timestamp in milliseconds. Final verification requires
 * the current time to be strictly earlier than the timestamp; attenuation may
 * shorten validity but never extend it.
 *
 * New L402 macaroons should use the standard `valid-until=<ISO-8601>` caveat
 * and `validUntilSatisfier()`. This satisfier is supported for imported
 * LSAT-style macaroons that already carry `expiration` caveats. L402
 * protocol-specification.md §10 requires servers to accept legacy LSAT
 * credentials alongside current L402 credentials.
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

/**
 * Creates a satisfier for the `origin` caveat.
 *
 * Final verification requires the request `Origin` header to appear in the
 * caveat value and, unless `allowedOrigins` is `"any"`, in the caller policy.
 * Attenuation only allows later origin lists to be subsets of earlier ones.
 */
export function originSatisfier(allowedOrigins: string[] | "any"): CaveatSatisfier {
  return {
    condition: "origin",
    satisfyPrevious(previous, next) {
      return isStringSubset(parseCsvValue(next.value), parseCsvValue(previous.value));
    },
    satisfyFinal(caveat, context) {
      const origin = context.request?.headers.get("Origin");
      if (origin === null || origin === undefined) {
        return false;
      }
      const caveatOrigins = parseCsvValue(caveat.value);
      return (
        caveatOrigins.includes(origin) &&
        (allowedOrigins === "any" || allowedOrigins.includes(origin))
      );
    },
  };
}

/**
 * Creates a satisfier for the legacy `ip` caveat.
 *
 * L402 macaroon-spec.md §Verification evaluates registered satisfiers for
 * known caveat conditions. Final verification compares the caveat value with
 * the first value in the `X-Forwarded-For` request header, falling back to
 * `context.clientIp`. Attenuation is exact: a later `ip` caveat must repeat the
 * same IP value.
 */
export function ipSatisfier(): CaveatSatisfier {
  return {
    condition: "ip",
    satisfyPrevious(previous, next) {
      return normalizeIp(next.value) === normalizeIp(previous.value);
    },
    satisfyFinal(caveat, context) {
      const actualIp = forwardedForIp(context.request) ?? context.clientIp;
      if (actualIp === undefined) {
        return false;
      }
      return normalizeIp(actualIp) === normalizeIp(caveat.value);
    },
  };
}

/**
 * Creates a satisfier for the `route` caveat.
 *
 * Final verification matches the request pathname against both the caveat value
 * and `allowedRoutes`. Route patterns support `*` globs. Attenuation only
 * allows later route lists to be subsets of earlier ones.
 */
export function routeSatisfier(allowedRoutes: string[]): CaveatSatisfier {
  return {
    condition: "route",
    satisfyPrevious(previous, next) {
      return isStringSubset(parseCsvValue(next.value), parseCsvValue(previous.value));
    },
    satisfyFinal(caveat, context) {
      if (context.request === undefined) {
        return false;
      }
      const path = new URL(context.request.url).pathname;
      const caveatRoutes = parseCsvValue(caveat.value);
      return matchesAnyRoute(path, caveatRoutes) && matchesAnyRoute(path, allowedRoutes);
    },
  };
}

function parseServicesValue(value: string): ServiceCaveatEntry[] {
  return parseCsvValue(value).map((entry) => {
    const separator = entry.lastIndexOf(":");
    if (separator <= 0 || separator === entry.length - 1) {
      throw new Error("invalid-services-caveat");
    }
    const tier = Number.parseInt(entry.slice(separator + 1), 10);
    if (!Number.isInteger(tier) || tier < 0) {
      throw new Error("invalid-services-caveat");
    }
    return {
      name: entry.slice(0, separator),
      tier,
    };
  });
}

function parseCsvValue(value: string): string[] {
  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    throw new Error("empty-caveat-value");
  }
  return entries;
}

function parseTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error("invalid-valid-until");
  }
  return timestamp;
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

function forwardedForIp(request: Request | undefined): string | undefined {
  const header = request?.headers.get("x-forwarded-for");
  return header?.split(",")[0]?.trim();
}

function normalizeIp(value: string): string {
  const ip = value.trim();
  if (ip.length === 0) {
    throw new Error("invalid-ip-caveat");
  }
  return ip;
}

function isServiceSubset(candidate: ServiceCaveatEntry[], allowed: ServiceCaveatEntry[]): boolean {
  return candidate.every((next) =>
    allowed.some((previous) => previous.name === next.name && previous.tier === next.tier),
  );
}

function isStringSubset(candidate: string[], allowed: string[]): boolean {
  return candidate.every((entry) => allowed.includes(entry));
}

function matchesAnyRoute(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => routePatternToRegExp(pattern).test(path));
}

function routePatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}
