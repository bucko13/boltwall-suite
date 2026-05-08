export interface ChallengeFixture {
  name: string;
  source: string;
  header: string;
  expected:
    | {
        ok: true;
        fields: Array<{
          scheme: "L402" | "LSAT";
          macaroon: string;
          invoice: string;
        }>;
      }
    | {
        ok: false;
        reason: string;
      };
}

export const SPEC_EXAMPLE_MACAROON = "AGIAJEemVQUTEyNCR0exk7ek90Cg==";

export const SPEC_EXAMPLE_INVOICE =
  "lnbc1500n1pw5kjhmpp5fu6xhthlt2vucmzkx6c7wtlh2r625r30cyjsfqhu8rsx4xpz5lwqdpa2fjkzep6yptksct5yp5hxgrrv96hx6twvusycn3qv9jx7ur5d9hkugr5dusx6cqzpgxqr23s79ruapxc4j5uskt4htly2salw4drq979d7rcela9wz02elhypmdzmzlnxuknpgfyfm86pntt8vvkvffma5qc9n50h4mvqhngadqy3ngqjcym5a";

export const specChallengeFixtures: ChallengeFixture[] = [
  {
    name: "spec-5-1-minimal-empty-values",
    source: "L402 protocol-specification.md §5.1 Challenge (required form)",
    header: 'L402 macaroon="", invoice=""',
    expected: {
      ok: true,
      fields: [
        {
          scheme: "L402",
          macaroon: "",
          invoice: "",
        },
      ],
    },
  },
  {
    name: "spec-5-1-example-real-values",
    source: "L402 protocol-specification.md §5.1 Challenge (example)",
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
    name: "spec-5-3-quoted-params",
    source: "L402 protocol-specification.md §5.3 Grammar",
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
    name: "spec-5-3-one-or-more-spaces-after-scheme",
    source: "L402 protocol-specification.md §5.3 Grammar (1*SP after scheme)",
    header: `L402   macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
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
    name: "spec-5-3-base64-padding-preserved",
    source: "L402 protocol-specification.md §5.3 Grammar (base64 includes '=')",
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
    name: "spec-5-case-insensitive-scheme",
    source: "L402 protocol-specification.md §5 The L402 Authentication Scheme (case-insensitive)",
    header: `l402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
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
    name: "spec-6-1-server-must-include-challenge-header",
    source: "L402 protocol-specification.md §6.1 Server Flow (step 4 references §5.1)",
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
];
