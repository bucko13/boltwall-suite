import { SPEC_EXAMPLE_MACAROON } from "../challenges/spec-examples";

import {
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
  type AuthorizationFixture,
} from "./spec-examples";

// L402 protocol-specification.md §10 Backwards Compatibility — the legacy
// `LSAT` scheme keyword MUST be accepted on incoming Authorization headers
// so old clients can keep authenticating against new servers during the
// migration window.
export const legacyLsatAuthorizationFixtures: AuthorizationFixture[] = [
  {
    name: "lsat-single-macaroon",
    source: "L402 protocol-specification.md §10 Backwards Compatibility",
    header: `LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "LSAT",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "lsat-multi-macaroon",
    source:
      "L402 protocol-specification.md §10 Backwards Compatibility plus §5.3 Grammar (macaroons = base64 *(\",\" base64))",
    header: `LSAT ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "LSAT",
        macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "lsat-mixed-case",
    source:
      "L402 protocol-specification.md §10 Backwards Compatibility (legacy scheme accepted)",
    header: `Lsat ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "LSAT",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
];
