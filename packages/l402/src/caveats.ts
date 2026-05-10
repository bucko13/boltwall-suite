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
