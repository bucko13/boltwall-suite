import {
  SPEC_EXAMPLE_INVOICE,
  SPEC_EXAMPLE_MACAROON,
  SPEC_EXAMPLE_PREIMAGE,
} from "@boltwall/test-fixtures";
import { describe, expect, it } from "bun:test";

import {
  detectArtifact,
  detectArtifactKind,
  describeArtifactError,
  type RejectedArtifact,
} from "./detect-artifact";

// Real L402 wire vectors from the shared fixture package (spec §5). The
// challenge/credential carry SPEC_EXAMPLE_MACAROON as an opaque field, which the
// header/token parsers accept without decoding the macaroon binary.
const CHALLENGE = `L402 macaroon="${SPEC_EXAMPLE_MACAROON}", invoice="${SPEC_EXAMPLE_INVOICE}"`;
const CREDENTIAL = `L402 ${SPEC_EXAMPLE_MACAROON}:${SPEC_EXAMPLE_PREIMAGE}`;

// A fully-decodable macaroon: the bare-macaroon path calls L402.fromMacaroon,
// which decodes the binary structure (SPEC_EXAMPLE_MACAROON is an opaque
// challenge-field token and does not decode). Minted over
// macaroonCodecFixtures[0]'s root key + identifier — the same vector as
// parse-token.spec.ts.
const DECODABLE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";

describe("detectArtifactKind", () => {
  it("recognizes a challenge by its macaroon= parameter", () => {
    expect(detectArtifactKind(CHALLENGE)).toBe("challenge");
  });

  it("tolerates a WWW-Authenticate: header prefix on a challenge", () => {
    expect(detectArtifactKind(`WWW-Authenticate: ${CHALLENGE}`)).toBe("challenge");
  });

  it("recognizes the LSAT scheme as a challenge too", () => {
    expect(detectArtifactKind(`LSAT macaroon="${SPEC_EXAMPLE_MACAROON}", invoice=""`)).toBe(
      "challenge",
    );
  });

  it("recognizes a credential (scheme + token, no macaroon=)", () => {
    expect(detectArtifactKind(CREDENTIAL)).toBe("credential");
  });

  it("tolerates an Authorization: header prefix on a credential", () => {
    expect(detectArtifactKind(`Authorization: ${CREDENTIAL}`)).toBe("credential");
  });

  it("falls back to macaroon for a bare token", () => {
    expect(detectArtifactKind(DECODABLE_MACAROON)).toBe("macaroon");
  });

  it("reports empty for blank or whitespace-only input", () => {
    expect(detectArtifactKind("")).toBe("empty");
    expect(detectArtifactKind("   ")).toBe("empty");
  });
});

describe("detectArtifact", () => {
  it("parses a challenge and exposes its macaroon", () => {
    const result = detectArtifact(CHALLENGE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("challenge");
      expect(result.value.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
      expect(result.value.token).toBeDefined();
    }
  });

  it("strips a WWW-Authenticate: prefix before parsing a challenge", () => {
    const result = detectArtifact(`WWW-Authenticate: ${CHALLENGE}`);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.kind).toBe("challenge");
  });

  it("parses a credential and exposes its macaroon", () => {
    const result = detectArtifact(CREDENTIAL);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("credential");
      expect(result.value.macaroon).toBe(SPEC_EXAMPLE_MACAROON);
    }
  });

  it("parses a bare macaroon", () => {
    const result = detectArtifact(DECODABLE_MACAROON);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("macaroon");
      expect(result.value.macaroon).toBe(DECODABLE_MACAROON);
    }
  });

  it("rejects empty input as kind 'empty'", () => {
    const result = detectArtifact("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("empty");
      expect(result.error.reason).toBe("empty");
    }
  });

  it("rejects a malformed challenge but keeps the detected kind", () => {
    const result = detectArtifact('L402 macaroon="!!! not base64 !!!", invoice="lnbc1"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("challenge");
      expect(result.error.reason).not.toBe("");
    }
  });

  it("rejects a malformed bare token as kind 'macaroon'", () => {
    const result = detectArtifact("not-valid-base64!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("macaroon");
  });
});

describe("describeArtifactError", () => {
  const message = (kind: RejectedArtifact["kind"]): string =>
    describeArtifactError({ kind, reason: "x" });

  it("maps every detected kind to a distinct, form-specific message", () => {
    expect(message("empty")).toBe("Paste a macaroon, an L402 challenge, or a credential.");
    expect(message("challenge")).toContain("challenge");
    expect(message("credential")).toContain("credential");
    expect(message("macaroon")).toContain("macaroon");
    // The four branches produce four distinct strings.
    const all = ["empty", "challenge", "credential", "macaroon"].map((k) =>
      message(k as RejectedArtifact["kind"]),
    );
    expect(new Set(all).size).toBe(4);
  });
});
