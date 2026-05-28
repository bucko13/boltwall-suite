import { parseCaveat, type Caveat } from "./caveats";
import { decodeIdentifier, type MacaroonIdentifierV0 } from "./decode-identifier";
import { decodeRaw } from "./internal/macaroon";

/**
 * Display-oriented view of a first-party macaroon caveat.
 */
export interface InspectedMacaroonCaveat {
  /** Raw UTF-8 bytes encoded into the macaroon HMAC chain. */
  raw: Uint8Array;
  /** UTF-8 caveat text as stored in the macaroon. */
  text: string;
  /** Condition segment before the first `=`. Falls back to `text` for malformed caveats. */
  condition: string;
  /** Value segment after the first `=`. Empty for malformed caveats. */
  value: string;
  /** Parsed caveat, or `null` when the raw text is not `condition=value`. */
  parsed: Caveat | null;
}

/**
 * Inspection view for a base64-encoded L402 macaroon.
 */
export interface MacaroonInspection {
  /**
   * Decoded version-0 identifier fields.
   *
   * Spec: L402 macaroon-spec.md §Identifier Structure / Version 0 Format.
   */
  identifier: MacaroonIdentifierV0;
  /** Raw 66-byte identifier bytes. */
  identifierBytes: Uint8Array;
  /**
   * First-party caveats in macaroon order.
   *
   * Spec: L402 macaroon-spec.md §Caveat Format.
   */
  caveats: InspectedMacaroonCaveat[];
  /** Raw 32-byte HMAC signature. */
  signature: Uint8Array;
}

/**
 * Decode a base64-encoded L402 macaroon into protocol-owned inspection fields.
 *
 * This helper is intended for diagnostics and UI review surfaces. It does not
 * verify the macaroon signature or payment preimage; use `verifyMacaroon` for
 * authorization decisions.
 *
 * Spec: L402 macaroon-spec.md §Serialization Formats / Macaroon V2 Binary
 * Format for the base64 V2 macaroon wrapper, §Identifier Structure for the v0
 * identifier, and §Caveat Format for UTF-8 first-party caveats.
 *
 * Throws synchronously on malformed macaroon input.
 */
export function inspectMacaroon(macaroon: string): MacaroonInspection {
  const raw = decodeRaw(macaroon);
  const identifier = decodeIdentifier(macaroon);
  const decoder = new TextDecoder();

  return {
    identifier,
    identifierBytes: raw.identifier.slice(),
    caveats: raw.caveats.map((caveat) => inspectCaveat(caveat, decoder)),
    signature: raw.signature.slice(),
  };
}

function inspectCaveat(raw: Uint8Array, decoder: TextDecoder): InspectedMacaroonCaveat {
  const bytes = raw.slice();
  const text = decoder.decode(bytes);

  try {
    const parsed = parseCaveat(text);
    return {
      raw: bytes,
      text,
      condition: parsed.condition,
      value: parsed.value,
      parsed,
    };
  } catch {
    return {
      raw: bytes,
      text,
      condition: text,
      value: "",
      parsed: null,
    };
  }
}
