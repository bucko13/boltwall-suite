import { describe, expect, test } from "bun:test";

import {
  VerificationFailurePrefix,
  VerificationFailureReason,
  type VerificationFailureReasonValue,
} from "../src/verification-failure";

describe("VerificationFailureReason", () => {
  test("exposes the documented runtime strings unchanged", () => {
    // Wire-stable strings: downstream packages and existing legacy callers
    // depend on these exact values. Changing one is a breaking API change.
    expect(VerificationFailureReason.SignatureInvalid).toBe("signature-invalid");
    expect(VerificationFailureReason.UnknownToken).toBe("unknown-token");
    expect(VerificationFailureReason.PreimageMismatch).toBe("preimage-mismatch");
  });

  test("is a const object (frozen-typed)", () => {
    // `as const` produces a readonly object literal at the type layer; this
    // guards against accidental mutation in callers and confirms the shape.
    const value = VerificationFailureReason as Record<string, string>;
    expect(Object.keys(value).length).toBe(3);
  });
});

describe("VerificationFailurePrefix", () => {
  test("exposes the documented runtime prefix strings unchanged", () => {
    expect(VerificationFailurePrefix.CaveatRejected).toBe("caveat-rejected:");
    expect(VerificationFailurePrefix.UnknownCaveat).toBe("unknown-caveat:");
  });

  test("composes into the template form expected by verifyMacaroon callers", () => {
    const condition = "expiration";
    const reason: VerificationFailureReasonValue = `${VerificationFailurePrefix.CaveatRejected}${condition}`;
    expect(reason).toBe("caveat-rejected:expiration");
    expect(reason.startsWith(VerificationFailurePrefix.CaveatRejected)).toBe(true);
  });
});

describe("VerificationFailureReasonValue", () => {
  test("accepts every fixed reason value", () => {
    const fixed: VerificationFailureReasonValue[] = [
      VerificationFailureReason.SignatureInvalid,
      VerificationFailureReason.UnknownToken,
      VerificationFailureReason.PreimageMismatch,
    ];
    expect(fixed).toEqual(["signature-invalid", "unknown-token", "preimage-mismatch"]);
  });

  test("accepts template-form reasons", () => {
    const caveatRejected: VerificationFailureReasonValue = `${VerificationFailurePrefix.CaveatRejected}origin`;
    const unknownCaveat: VerificationFailureReasonValue = `${VerificationFailurePrefix.UnknownCaveat}foo`;
    expect(caveatRejected).toBe("caveat-rejected:origin");
    expect(unknownCaveat).toBe("unknown-caveat:foo");
  });
});
