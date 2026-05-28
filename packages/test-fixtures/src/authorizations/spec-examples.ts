// Reuse the canonical spec macaroon from the challenge fixtures so
// cross-parser round-trips share one source of truth. We do NOT re-export
// it from this module — the package barrel already surfaces it via
// `./challenges`, and re-exporting here would create a name collision.
import { SPEC_EXAMPLE_MACAROON } from "../challenges/spec-examples";

export type L402AuthorizationScheme = "L402" | "LSAT";

export interface AuthorizationFixture {
  name: string;
  source: string;
  header: string;
  expected:
    | {
        ok: true;
        fields: {
          scheme: L402AuthorizationScheme;
          macaroons: string[];
          preimage: string;
        };
      }
    | {
        ok: false;
        reason: string;
      };
}

// 64 hex chars (= 32 bytes). L402 protocol-specification.md §5.2
// Credentials describes the payment preimage as hex-encoded.
export const SPEC_EXAMPLE_PREIMAGE =
  "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

export const SPEC_EXAMPLE_MACAROON_2 = "AwIBaWQDAgQyAAAA"; // a second well-shaped base64 token for multi-macaroon vectors

export const specAuthorizationFixtures: AuthorizationFixture[] = [
  {
    name: "spec-5-single-macaroon",
    source: "L402 protocol-specification.md §5.2 Credentials (Authorization)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "L402",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "spec-5-case-insensitive-scheme",
    source:
      "L402 protocol-specification.md §5 The L402 Authentication Scheme (case-insensitive scheme keyword)",
    header: `l402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "L402",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "spec-5-uppercase-preimage-hex",
    source: "L402 protocol-specification.md §5.3 Grammar (preimage = 1*HEXDIG)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE.toUpperCase()}`,
    expected: {
      ok: true,
      fields: {
        scheme: "L402",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE.toUpperCase(),
      },
    },
  },
];
