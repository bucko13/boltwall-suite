import { SPEC_EXAMPLE_MACAROON } from "../challenges/spec-examples";

import {
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
  type AuthorizationFixture,
} from "./spec-examples";

// L402 protocol-specification.md §5.3 Grammar makes multiple macaroons
// first-class in the Authorization credential:
// `<scheme> M1,M2[,...]:<preimage-hex>`. Each macaroon is a separate
// base64 token. The verifier checks each macaroon's payment-hash against
// the single preimage and accepts the credential if any matches.
export const multiMacaroonAuthorizationFixtures: AuthorizationFixture[] = [
  {
    name: "two-macaroons-no-whitespace",
    source: "L402 protocol-specification.md §5.3 Grammar (macaroons = base64 *(\",\" base64))",
    header: `L402 ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "L402",
        macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "three-macaroons",
    source: "L402 protocol-specification.md §5.3 Grammar (macaroons = base64 *(\",\" base64))",
    header: `L402 ${SPEC_EXAMPLE_MACAROON},${SPEC_EXAMPLE_MACAROON_2},${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: true,
      fields: {
        scheme: "L402",
        macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2, SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
];
