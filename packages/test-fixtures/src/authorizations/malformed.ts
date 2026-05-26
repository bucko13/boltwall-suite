import { SPEC_EXAMPLE_MACAROON } from "../challenges/spec-examples";

import {
  SPEC_EXAMPLE_PREIMAGE,
  type AuthorizationFixture,
} from "./spec-examples";

// Adversarial vectors hand-authored against L402 protocol-specification.md
// §5. Parser failure modes are covered here so conformance checks can assert
// stable error categories.
export const malformedAuthorizationFixtures: AuthorizationFixture[] = [
  {
    name: "missing-scheme",
    source: "hand-authored adversarial vector against L402 §5",
    header: `${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "missing-scheme",
    },
  },
  {
    name: "wrong-scheme-bearer",
    source: "hand-authored adversarial vector against L402 §5",
    header: `Bearer ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "scheme-mismatch",
    },
  },
  {
    name: "no-colon-separator",
    source: "hand-authored adversarial vector against L402 §5",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "missing-colon",
    },
  },
  {
    name: "preimage-not-hex",
    source: "hand-authored adversarial vector against L402 §5 (preimage = 32 bytes hex)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:not-hex-${"x".repeat(56)}`,
    expected: {
      ok: false,
      reason: "invalid-preimage-hex",
    },
  },
  {
    name: "preimage-too-short",
    source: "hand-authored adversarial vector against L402 §5 (preimage MUST be 32 bytes)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:abcdef`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
  {
    name: "preimage-too-long",
    source: "hand-authored adversarial vector against L402 §5 (preimage MUST be 32 bytes)",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}aa`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
  {
    name: "empty-macaroons-list",
    source: "hand-authored adversarial vector against L402 §5",
    header: `L402 :${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "empty-macaroons",
    },
  },
  {
    name: "empty-macaroon-in-list",
    source: "hand-authored adversarial vector against L402 §5",
    header: `L402 ${SPEC_EXAMPLE_MACAROON},:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "empty-macaroon",
    },
  },
  {
    name: "non-base64-macaroon",
    source: "hand-authored adversarial vector against L402 §5 (macaroon MUST be base64)",
    header: `L402 not-base64***:${SPEC_EXAMPLE_PREIMAGE}`,
    expected: {
      ok: false,
      reason: "invalid-macaroon-base64",
    },
  },
  {
    name: "empty-header",
    source: "hand-authored adversarial vector against L402 §5",
    header: "",
    expected: {
      ok: false,
      reason: "empty-header",
    },
  },
  {
    name: "missing-preimage",
    source: "hand-authored adversarial vector against L402 §5",
    header: `L402 ${SPEC_EXAMPLE_MACAROON}:`,
    expected: {
      ok: false,
      reason: "invalid-preimage-length",
    },
  },
];
