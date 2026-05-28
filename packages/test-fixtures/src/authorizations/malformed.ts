import { SPEC_EXAMPLE_MACAROON } from "../challenges/spec-examples";

import {
  SPEC_EXAMPLE_PREIMAGE,
  type AuthorizationFixture,
} from "./spec-examples";

// Adversarial vectors hand-authored against L402 protocol-specification.md
// §5.3 Grammar. Parser failure modes are covered here so conformance checks
// can assert stable error categories.
export const malformedAuthorizationFixtures: AuthorizationFixture[] = [
  {
    name: "missing-scheme",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: `${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "missing-scheme",
    },
  },
  {
    name: "wrong-scheme-bearer",
    source:
      "hand-authored adversarial vector against L402 protocol-specification.md §5 The L402 Authentication Scheme",
    header: `Bearer ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "scheme-mismatch",
    },
  },
  {
    name: "no-colon-separator",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "missing-colon",
    },
  },
  {
    name: "preimage-not-hex",
    source:
      "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar (preimage = 1*HEXDIG)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:not-hex-${"x".repeat(56)}`,
    expected: {
      ok: false,
      reason: "invalid-preimage-hex",
    },
  },
  {
    name: "preimage-too-short",
    source:
      "hand-authored adversarial vector against L402 protocol-specification.md §5.2 Credentials (Authorization)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:abcdef`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
  {
    name: "preimage-too-long",
    source:
      "hand-authored adversarial vector against L402 protocol-specification.md §5.2 Credentials (Authorization)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}aa`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
  {
    name: "empty-macaroons-list",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: `L402 :${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "empty-macaroons",
    },
  },
  {
    name: "empty-macaroon-in-list",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: `L402 ${SPEC_EXAMPLE_MACAROON},:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "empty-macaroon",
    },
  },
  {
    name: "non-base64-macaroon",
    source:
      "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar (base64 alphabet)",
    header: `L402 not-base64***:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "invalid-macaroon-base64",
    },
  },
  {
    name: "empty-header",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: "",
    expected: {
      ok: false,
      reason: "empty-header",
    },
  },
  {
    name: "missing-preimage",
    source: "hand-authored adversarial vector against L402 protocol-specification.md §5.3 Grammar",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
];
