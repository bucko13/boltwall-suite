/**
 * A parsed first-party L402 caveat string.
 */
export interface Caveat {
  /** Caveat condition, the bytes before the first `=` separator. */
  condition: string;
  /** Caveat value, the bytes after the first `=` separator. */
  value: string;
}

/**
 * Parse one L402 caveat string into `{ condition, value }`.
 *
 * Spec: L402 macaroon-spec.md §Caveats defines caveats as UTF-8 strings in
 * `condition=value` form, including `services=...`,
 * `<service>_capabilities=...`, and `<capability>_<constraint>=...`.
 *
 * The first `=` is the separator; later `=` bytes belong to the value.
 * Whitespace around the separator is trimmed.
 */
export function parseCaveat(input: string): Caveat {
  const separator = input.indexOf("=");
  if (separator === -1) {
    throw new Error("missing-caveat-separator");
  }

  const condition = input.slice(0, separator).trim();
  if (condition.length === 0) {
    throw new Error("empty-caveat-condition");
  }

  return {
    condition,
    value: input.slice(separator + 1).trim(),
  };
}

/**
 * Serialize one parsed caveat back to its wire string form.
 */
export function serializeCaveat(caveat: Caveat): string {
  const condition = caveat.condition.trim();
  if (condition.length === 0) {
    throw new Error("empty-caveat-condition");
  }

  return `${condition}=${caveat.value.trim()}`;
}

/**
 * Build a `services=...` caveat for the services authorized by a macaroon.
 */
export function servicesCaveat(
  services: Array<{ name: string; tier: number }>,
): Caveat {
  return {
    condition: "services",
    value: services.map((service) => `${service.name}:${service.tier}`).join(","),
  };
}

/**
 * Build a `<service>_capabilities=...` caveat.
 */
export function capabilitiesCaveat(
  service: string,
  capabilities: string[],
): Caveat {
  return {
    condition: `${service}_capabilities`,
    value: capabilities.join(","),
  };
}

/**
 * Build a `<capability>_<constraint>=...` caveat.
 */
export function constraintCaveat(
  capability: string,
  key: string,
  value: string,
): Caveat {
  return {
    condition: `${capability}_${key}`,
    value,
  };
}

type ValidUntilArg = { seconds: number } | { iso: string } | { date: Date };

/**
 * Build a `valid-until=<ISO-8601>` caveat.
 *
 * Matches `validUntilSatisfier()` — condition is `"valid-until"`, value is
 * an ISO-8601 timestamp string. Accepted forms:
 * - `{ seconds: n }` — n seconds from now
 * - `{ iso: "..." }` — exact ISO-8601 string
 * - `{ date: Date }` — uses `.toISOString()`
 */
export function validUntil(args: ValidUntilArg): Caveat {
  let value: string;
  if ("seconds" in args) {
    value = new Date(Date.now() + args.seconds * 1000).toISOString();
  } else if ("iso" in args) {
    value = args.iso;
  } else {
    value = args.date.toISOString();
  }
  return { condition: "valid-until", value };
}

/**
 * Build an `origin=<origins>` caveat.
 *
 * Matches `originSatisfier()`. Multiple origins are comma-joined.
 * - `originCaveat("https://example.com")` → `{ condition: "origin", value: "https://example.com" }`
 * - `originCaveat(["https://a.com", "https://b.com"])` → comma-joined value
 */
export function originCaveat(allowed: string | string[]): Caveat {
  const origins = Array.isArray(allowed) ? allowed : [allowed];
  return { condition: "origin", value: origins.join(",") };
}

/**
 * Build an `ip=<client-ip>` compatibility caveat.
 *
 * L402 macaroon-spec.md §Caveat Format defines first-party caveats as
 * `condition=value` strings. This helper preserves the legacy Boltwall
 * `ip` caveat shape for deployments that explicitly bind credentials to a
 * request IP address. The caller is responsible for trusting the request IP
 * source, such as a configured reverse proxy.
 */
export function ipCaveat(ip: string): Caveat {
  const value = ip.trim();
  if (value.length === 0) {
    throw new Error("invalid-ip-caveat");
  }
  return { condition: "ip", value };
}

/**
 * Build a `route=<patterns>` caveat.
 *
 * Matches `routeSatisfier()`. Patterns support `*` globs; multiple patterns
 * are comma-joined.
 * - `routeCaveat("/api/*")` → `{ condition: "route", value: "/api/*" }`
 * - `routeCaveat(["/api/*", "/v1/*"])` → comma-joined value
 */
export function routeCaveat(allowed: string | string[]): Caveat {
  const routes = Array.isArray(allowed) ? allowed : [allowed];
  return { condition: "route", value: routes.join(",") };
}
