import { SPEC_EXAMPLE_PREIMAGE } from "../authorizations/spec-examples";
import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
} from "../challenges/spec-examples";

const LSAT_JS_COMMIT = "d902b9553bfb371f3c74773a80d65d3b35c50a81";

export interface LegacyLsatJsCompatFixture {
  name: string;
  source: string;
  kind: "challenge" | "authorization" | "caveat";
  input: string;
  expected:
    | {
        kind: "challenge";
        fields: {
          scheme: "LSAT";
          macaroon: string;
          invoice: string;
        };
      }
    | {
        kind: "authorization";
        fields: {
          scheme: "LSAT";
          macaroons: string[];
          preimage: string;
        };
      }
    | {
        kind: "caveat";
        fields: {
          condition: string;
          value: string;
        };
      };
}

export const lsatJsCompatFixtures: LegacyLsatJsCompatFixture[] = [
  {
    name: "lsat-js-lsat-to-challenge-shape",
    source: `Tierion/lsat-js src/lsat.ts@${LSAT_JS_COMMIT} Lsat#toChallenge`,
    kind: "challenge",
    input: `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      kind: "challenge",
      fields: {
        scheme: "LSAT",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    },
  },
  {
    name: "lsat-js-from-challenge-invoice-first",
    source: `Tierion/lsat-js src/lsat.ts@${LSAT_JS_COMMIT} Lsat.fromChallenge unordered params`,
    kind: "challenge",
    input: `LSAT invoice="${SPEC_EXAMPLE_INVOICE}", macaroon="${SPEC_EXAMPLE_MACAROON}"`,
    expected: {
      kind: "challenge",
      fields: {
        scheme: "LSAT",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    },
  },
  {
    name: "lsat-js-from-header-tolerates-extra-spacing",
    source: `Tierion/lsat-js src/lsat.ts@${LSAT_JS_COMMIT} Lsat.fromHeader`,
    kind: "challenge",
    input: `LSAT   macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      kind: "challenge",
      fields: {
        scheme: "LSAT",
        macaroon: SPEC_EXAMPLE_MACAROON,
        invoice: SPEC_EXAMPLE_INVOICE,
      },
    },
  },
  {
    name: "lsat-js-lsat-to-token-shape",
    source: `Tierion/lsat-js src/lsat.ts@${LSAT_JS_COMMIT} Lsat#toToken`,
    kind: "authorization",
    input: `LSAT ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      kind: "authorization",
      fields: {
        scheme: "LSAT",
        macaroons: [SPEC_EXAMPLE_MACAROON],
        preimage: SPEC_EXAMPLE_PREIMAGE,
      },
    },
  },
  {
    name: "lsat-js-caveat-expiration-readme-example",
    source: `Tierion/lsat-js README.md@${LSAT_JS_COMMIT} Caveat example`,
    kind: "caveat",
    input: "expiration=1577228778197",
    expected: {
      kind: "caveat",
      fields: {
        condition: "expiration",
        value: "1577228778197",
      },
    },
  },
  {
    name: "lsat-js-caveat-decode-trims-parts",
    source: `Tierion/lsat-js src/caveat.ts@${LSAT_JS_COMMIT} Caveat.decode`,
    kind: "caveat",
    input: "expiration = 1577228778197",
    expected: {
      kind: "caveat",
      fields: {
        condition: "expiration",
        value: "1577228778197",
      },
    },
  },
];
