import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  type ChallengeFixture,
} from "./spec-examples";

export const malformedChallengeFixtures: ChallengeFixture[] = [
  {
    name: "missing-macaroon-param",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1",
    header: `L402 invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: false,
      reason: "missing-macaroon",
    },
  },
  {
    name: "missing-invoice-param",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1",
    header: `L402 macaroon="${SPEC_EXAMPLE_MACAROON}"`,
    expected: {
      ok: false,
      reason: "missing-invoice",
    },
  },
  {
    name: "invalid-macaroon-base64",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1 and §5.3",
    header: `L402 macaroon="not-base64***", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: false,
      reason: "invalid-macaroon-base64",
    },
  },
  {
    name: "invalid-bolt11-invoice",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1",
    header: `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="not-a-bolt11-invoice"`,
    expected: {
      ok: false,
      reason: "invalid-invoice",
    },
  },
  {
    name: "wrong-auth-scheme",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5",
    header: `Bearer macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: false,
      reason: "scheme-mismatch",
    },
  },
  {
    name: "empty-header",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1",
    header: "",
    expected: {
      ok: false,
      reason: "empty-header",
    },
  },
  {
    name: "garbage-data",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3",
    header: "this is not an auth challenge",
    expected: {
      ok: false,
      reason: "garbage-data",
    },
  },
  {
    name: "unexpected-param-name",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.1",
    header: `L402 token="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`,
    expected: {
      ok: false,
      reason: "unexpected-param",
    },
  },
];
