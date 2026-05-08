import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  type ChallengeFixture,
} from "./spec-examples";

export const dualSchemeChallengeFixtures: ChallengeFixture[] = [
  {
    name: "lsat-only-challenge",
    source: "L402 protocol-specification.md §10 Backwards Compatibility",
    header: `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: true,
      fields: [
        {
          scheme: "LSAT",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
      ],
    },
  },
  {
    name: "l402-only-challenge",
    source: "L402 protocol-specification.md §10 Backwards Compatibility",
    header: `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: true,
      fields: [
        {
          scheme: "L402",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
      ],
    },
  },
  {
    name: "dual-lsat-first-spec-order",
    source: "L402 protocol-specification.md §10 Backwards Compatibility",
    header: `LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}", L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: true,
      fields: [
        {
          scheme: "LSAT",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
        {
          scheme: "L402",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
      ],
    },
  },
  {
    name: "dual-l402-first-parser-compat",
    source: "L402 protocol-specification.md §10 Backwards Compatibility plus hand-authored compatibility vector",
    header: `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}", LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: true,
      fields: [
        {
          scheme: "L402",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
        {
          scheme: "LSAT",
          macaroon: SPEC_EXAMPLE_MACAROON,
          invoice: SPEC_EXAMPLE_INVOICE,
        },
      ],
    },
  },
];
