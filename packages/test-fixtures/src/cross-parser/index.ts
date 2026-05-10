import {
  SPEC_EXAMPLE_MACAROON_2,
  SPEC_EXAMPLE_PREIMAGE,
} from "../authorizations/spec-examples";
import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
} from "../challenges/spec-examples";

export interface CrossParserRoundTripFixture {
  name: string;
  source: string;
  challenge: {
    compatibility: "dual" | "l402-only" | "lsat-only";
    macaroon: string;
    invoice: string;
    expectedSchemes: Array<"LSAT" | "L402">;
  };
  authorization: {
    scheme: "LSAT" | "L402";
    macaroons: string[];
    preimage: string;
  };
}

export const crossParserRoundTripFixtures: CrossParserRoundTripFixture[] = [
  {
    name: "dual-challenge-to-l402-authorization",
    source:
      "L402 protocol-specification.md §5 and §10 cross-parser round trip",
    challenge: {
      compatibility: "dual",
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
      expectedSchemes: ["LSAT", "L402"],
    },
    authorization: {
      scheme: "L402",
      macaroons: [SPEC_EXAMPLE_MACAROON],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    },
  },
  {
    name: "lsat-only-challenge-to-legacy-authorization",
    source:
      "L402 protocol-specification.md §10 legacy LSAT compatibility round trip",
    challenge: {
      compatibility: "lsat-only",
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
      expectedSchemes: ["LSAT"],
    },
    authorization: {
      scheme: "LSAT",
      macaroons: [SPEC_EXAMPLE_MACAROON],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    },
  },
  {
    name: "dual-challenge-to-multi-macaroon-authorization",
    source:
      "L402 protocol-specification.md §5 multi-macaroon credential round trip",
    challenge: {
      compatibility: "dual",
      macaroon: SPEC_EXAMPLE_MACAROON,
      invoice: SPEC_EXAMPLE_INVOICE,
      expectedSchemes: ["LSAT", "L402"],
    },
    authorization: {
      scheme: "L402",
      macaroons: [SPEC_EXAMPLE_MACAROON, SPEC_EXAMPLE_MACAROON_2],
      preimage: SPEC_EXAMPLE_PREIMAGE,
    },
  },
];
