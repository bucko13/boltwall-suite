/**
 * Comparator accepted by the caveat object API.
 *
 * Current L402 caveats use `condition=value`. The `<` and `>` comparators are
 * accepted so imported LSAT-style caveats can still be decoded, inspected, and
 * attenuated.
 */
export type CaveatComparator = "=" | "<" | ">";

/**
 * Runtime Caveat constructor for object-first L402 and LSAT migration code.
 *
 * [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 * §Caveat Format defines first-party caveats as UTF-8 `condition=value`
 * strings. The class defaults to that standard `"="` comparator while
 * preserving `<` and `>` comparator caveats used by older LSAT object
 * workflows at the object/macaroon layer.
 */
export class Caveat {
  /** Caveat condition name, such as `services` or `valid-until`. */
  readonly condition: string;
  /** Caveat value after the comparator, trimmed at construction time. */
  readonly value: string;
  /** Comparator used when `encode()` renders the caveat string. */
  readonly comparator?: CaveatComparator;

  /**
   * Create a caveat from condition, value, and optional comparator.
   *
   * Use the default `=` comparator for new L402 caveats. Pass `<` or `>` only
   * when preserving a legacy comparator caveat that already exists.
   *
   * @throws `empty-caveat-condition` when `condition` is blank.
   * @throws `invalid-caveat-comparator` when `comparator` is not `=`, `<`, or `>`.
   * @param condition - Caveat condition name before the comparator.
   * @param value - Caveat value after the comparator.
   * @param comparator - Comparator used by `encode()`. Defaults to `=`.
   *
   * @example
   * new Caveat("valid-until", "2026-01-01T00:00:00.000Z").encode();
   * // "valid-until=2026-01-01T00:00:00.000Z"
   */
  constructor(condition: string, value: string, comparator: CaveatComparator = "=") {
    const normalizedCondition = condition.trim();
    if (normalizedCondition.length === 0) {
      throw new Error("empty-caveat-condition");
    }
    assertComparator(comparator);

    this.condition = normalizedCondition;
    this.value = value.trim();
    Object.defineProperty(this, "comparator", {
      value: comparator,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  /**
   * Return the macaroon caveat string encoded into the HMAC chain.
   *
   * The L402 macaroon spec defines first-party caveats as UTF-8
   * `condition=value` strings. This method also preserves decoded `<` and `>`
   * comparator caveats for compatibility.
   *
   * @example
   * Caveat.validUntil({ iso: "2026-01-01T00:00:00.000Z" }).encode();
   * // "valid-until=2026-01-01T00:00:00.000Z"
   */
  encode(): string {
    return `${this.condition}${this.comparator ?? "="}${this.value}`;
  }

  /**
   * Decode one caveat string into a `Caveat` object.
   *
   * The first `=`, `<`, or `>` is used as the comparator. Later comparator
   * characters belong to the value, which allows values such as URLs or query
   * strings to round-trip.
   *
   * @throws `missing-caveat-separator` when no supported comparator is present.
   * @throws `empty-caveat-condition` when the decoded condition is blank.
   * @param input - Caveat string such as `services=api:0` or `expires<1700000000`.
   *
   * @example
   * const caveat = Caveat.decode("services=api:0");
   * caveat.condition; // "services"
   * caveat.value; // "api:0"
   *
   * Caveat.decode("expires<1700000000").comparator; // "<"
   */
  static decode(input: string): Caveat {
    const separator = firstComparatorIndex(input);
    if (separator === -1) {
      throw new Error("missing-caveat-separator");
    }

    return new Caveat(
      input.slice(0, separator),
      input.slice(separator + 1),
      input[separator] as CaveatComparator,
    );
  }

  /**
   * Build a `services=...` caveat.
   *
   * @param services - Authorized services and their tier numbers.
   *
   * @example
   * Caveat.services([{ name: "api", tier: 0 }]).encode();
   * // "services=api:0"
   */
  static services(services: Array<{ name: string; tier: number }>): Caveat {
    return servicesCaveat(services);
  }

  /**
   * Build a `<service>_capabilities=...` caveat.
   *
   * @param service - Service name that owns the capabilities.
   * @param capabilities - Allowed capability names.
   */
  static capabilities(service: string, capabilities: string[]): Caveat {
    return capabilitiesCaveat(service, capabilities);
  }

  /**
   * Build a `<capability>_<key>=...` constraint caveat.
   *
   * @param capability - Capability name being constrained.
   * @param key - Constraint key suffix.
   * @param value - Constraint value.
   */
  static constraint(capability: string, key: string, value: string): Caveat {
    return constraintCaveat(capability, key, value);
  }

  /**
   * Build a preferred `valid-until=<ISO-8601>` expiration caveat.
   *
   * @param args - Expiration as seconds from now, ISO string, or `Date`.
   *
   * @example
   * Caveat.validUntil({ iso: "2026-01-01T00:00:00.000Z" }).encode();
   * // "valid-until=2026-01-01T00:00:00.000Z"
   */
  static validUntil(args: ValidUntilArg): Caveat {
    return validUntil(args);
  }

  /**
   * Build a legacy-compatible `expiration=<unix-ms>` caveat.
   *
   * @param unixMs - Expiration timestamp in Unix milliseconds.
   */
  static expiration(unixMs: number): Caveat {
    return expirationCaveat(unixMs);
  }

  /**
   * Build an `origin=...` caveat for browser or request origin checks.
   *
   * @param allowed - One origin or a comma-joined list source.
   */
  static origin(allowed: string | string[]): Caveat {
    return originCaveat(allowed);
  }

  /**
   * Build an `ip=...` caveat for deployments that trust a client IP source.
   *
   * @param ip - Trusted client IP value to bind into the caveat.
   */
  static ip(ip: string): Caveat {
    return ipCaveat(ip);
  }

  /**
   * Build a `route=...` caveat for request path restrictions.
   *
   * @param allowed - One path pattern or a list of path patterns.
   */
  static route(allowed: string | string[]): Caveat {
    return routeCaveat(allowed);
  }
}

function firstComparatorIndex(input: string): number {
  let result = -1;
  for (const comparator of ["=", "<", ">"] as const) {
    const index = input.indexOf(comparator);
    if (index !== -1 && (result === -1 || index < result)) {
      result = index;
    }
  }
  return result;
}

function assertComparator(comparator: string): asserts comparator is CaveatComparator {
  if (comparator !== "=" && comparator !== "<" && comparator !== ">") {
    throw new Error("invalid-caveat-comparator");
  }
}

/**
 * Parse one L402 caveat string into `{ condition, value }`.
 *
 * Spec: [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 * §Caveats defines caveats as UTF-8 strings in `condition=value` form, including `services=...`,
 * `<service>_capabilities=...`, and `<capability>_<constraint>=...`.
 *
 * The first `=` is the separator; later `=` bytes belong to the value.
 * Whitespace around the separator is trimmed.
 */
export function parseCaveat(input: string): Caveat {
  return Caveat.decode(input);
}

/**
 * Serialize one parsed caveat back to its wire string form.
 */
export function serializeCaveat(caveat: Caveat): string {
  return caveat.encode();
}

/**
 * Build a `services=...` caveat for the services authorized by a macaroon.
 */
export function servicesCaveat(services: Array<{ name: string; tier: number }>): Caveat {
  return new Caveat(
    "services",
    services.map((service) => `${service.name}:${service.tier}`).join(","),
  );
}

/**
 * Build a `<service>_capabilities=...` caveat.
 */
export function capabilitiesCaveat(service: string, capabilities: string[]): Caveat {
  return new Caveat(`${service}_capabilities`, capabilities.join(","));
}

/**
 * Build a `<capability>_<constraint>=...` caveat.
 */
export function constraintCaveat(capability: string, key: string, value: string): Caveat {
  return new Caveat(`${capability}_${key}`, value);
}

type ValidUntilArg = { seconds: number } | { iso: string } | { date: Date };

/**
 * Build a `valid-until=<ISO-8601>` caveat.
 *
 * Matches `validUntilSatisfier()`. The condition is `"valid-until"` and the value is
 * an ISO-8601 timestamp string. Accepted forms:
 * - `{ seconds: n }`: n seconds from now
 * - `{ iso: "..." }`: exact ISO-8601 string
 * - `{ date: Date }`: uses `.toISOString()`
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
  return new Caveat("valid-until", value);
}

/**
 * Build an `expiration=<unix-ms>` caveat.
 *
 * New L402 macaroons should use the standard `valid-until=<ISO-8601>` caveat
 * through `validUntil(...)`. This helper is supported for imported LSAT-style
 * macaroons that already use the `expiration` condition. The
 * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
 * §10 requires servers to accept legacy LSAT credentials alongside current
 * L402 credentials.
 */
export function expirationCaveat(unixMs: number): Caveat {
  if (!Number.isFinite(unixMs)) {
    throw new Error("invalid-expiration");
  }

  return new Caveat("expiration", String(unixMs));
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
  return new Caveat("origin", origins.join(","));
}

/**
 * Build an `ip=<client-ip>` compatibility caveat.
 *
 * [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 * §Caveat Format defines first-party caveats as `condition=value` strings.
 * This helper preserves the legacy Boltwall `ip` caveat shape for deployments
 * that explicitly bind credentials to a request IP address. The caller is
 * responsible for trusting the request IP source, such as a configured reverse
 * proxy.
 */
export function ipCaveat(ip: string): Caveat {
  const value = ip.trim();
  if (value.length === 0) {
    throw new Error("invalid-ip-caveat");
  }
  return new Caveat("ip", value);
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
  return new Caveat("route", routes.join(","));
}
