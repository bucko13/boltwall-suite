/** Comparator accepted by the LSAT-compatible caveat object API. */
export type CaveatComparator = "=" | "<" | ">";

/**
 * Runtime Caveat constructor for object-first L402 and LSAT migration code.
 *
 * L402 macaroon-spec.md §Caveat Format defines first-party caveats as UTF-8
 * `condition=value` strings. The class defaults to that standard `"="`
 * comparator while preserving `<` and `>` comparator caveats used by older
 * LSAT object workflows at the object/macaroon layer.
 */
export class Caveat {
  readonly condition: string;
  readonly value: string;
  readonly comparator?: CaveatComparator;

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

  encode(): string {
    return `${this.condition}${this.comparator ?? "="}${this.value}`;
  }

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

  static services(services: Array<{ name: string; tier: number }>): Caveat {
    return servicesCaveat(services);
  }

  static capabilities(service: string, capabilities: string[]): Caveat {
    return capabilitiesCaveat(service, capabilities);
  }

  static constraint(capability: string, key: string, value: string): Caveat {
    return constraintCaveat(capability, key, value);
  }

  static validUntil(args: ValidUntilArg): Caveat {
    return validUntil(args);
  }

  static expiration(unixMs: number): Caveat {
    return expirationCaveat(unixMs);
  }

  static origin(allowed: string | string[]): Caveat {
    return originCaveat(allowed);
  }

  static ip(ip: string): Caveat {
    return ipCaveat(ip);
  }

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
 * Spec: L402 macaroon-spec.md §Caveats defines caveats as UTF-8 strings in
 * `condition=value` form, including `services=...`,
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
  return new Caveat("valid-until", value);
}

/**
 * Build an `expiration=<unix-ms>` caveat.
 *
 * New L402 macaroons should use the standard `valid-until=<ISO-8601>` caveat
 * through `validUntil(...)`. This helper is supported for imported LSAT-style
 * macaroons that already use the `expiration` condition. L402
 * protocol-specification.md §10 requires servers to accept legacy LSAT
 * credentials alongside current L402 credentials.
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
