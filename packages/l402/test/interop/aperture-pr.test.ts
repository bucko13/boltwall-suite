/**
 * Aperture interop tests for PR checks (bw-9zp.1).
 *
 * Guards: only runs when APERTURE_INTEROP=1 is set. Expects Aperture to be
 * reachable at APERTURE_URL (default http://localhost:8081) with the
 * docker-compose stack in packages/test-fixtures/aperture-smoke/ running.
 *
 * L402 spec references are cited inline per AGENTS.md RULE.
 *
 * Scenarios:
 *   1. GET protected endpoint → 402 with parseable L402 challenge.
 *   2. Challenge macaroon → decodeIdentifier extracts valid v0 identifier.
 *   3. Authorization header built from challenge macaroon → Aperture accepts it
 *      (strictverify=false in test config skips payment-hash proof).
 *   4. Tampered macaroon → Aperture returns 401, not 200.
 *   5. Dual-scheme challenge → both L402 and LSAT parse correctly.
 *   6. Multi-macaroon credential → parseAuthorizationHeader accepts it.
 */

import { describe, expect, test } from "bun:test";

import {
  buildAuthorizationHeader,
  decodeIdentifier,
  parseAuthenticateHeader,
  parseAuthorizationHeader,
} from "../../src";

const SKIP = process.env.APERTURE_INTEROP !== "1";
const BASE = process.env.APERTURE_URL ?? "http://localhost:8081";

// A valid-looking 32-byte hex preimage. With strictverify=false Aperture
// does not check whether sha256(preimage) == paymentHash, so any value works
// for integration-level header acceptance testing.
// L402 protocol-specification.md §6 Authorization
const FIXTURE_PREIMAGE_HEX = "0".repeat(64);

async function getProtected(path = "/pokemon/1", headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, { headers });
}

describe.skipIf(SKIP)("Aperture interop — PR check", () => {
  // --- Scenario 1 ---
  test("GET protected resource returns 402 with L402 WWW-Authenticate", async () => {
    const res = await getProtected();

    expect(res.status).toBe(402);

    const wwwAuth = res.headers.get("www-authenticate");
    expect(wwwAuth).toBeTruthy();

    // L402 protocol-specification.md §5 Challenge
    const challenges = parseAuthenticateHeader(wwwAuth!);
    expect(challenges.length).toBeGreaterThanOrEqual(1);
    const first = challenges[0];
    expect(first.scheme).toBe("L402");
    expect(typeof first.macaroon).toBe("string");
    expect(first.macaroon.length).toBeGreaterThan(0);
    expect(typeof first.invoice).toBe("string");
    expect(first.invoice.length).toBeGreaterThan(0);
  });

  // --- Scenario 2 ---
  test("challenge macaroon decodes to valid v0 identifier", async () => {
    const res = await getProtected();
    const wwwAuth = res.headers.get("www-authenticate")!;
    const [{ macaroon }] = parseAuthenticateHeader(wwwAuth);

    // L402 macaroon-spec.md §Identifier Structure
    const id = decodeIdentifier(macaroon);
    expect(id.version).toBe(0);
    expect(id.paymentHash).toHaveLength(32);
    expect(id.tokenId).toHaveLength(32);
  });

  // --- Scenario 3 ---
  test("Authorization header built from challenge macaroon is accepted by Aperture", async () => {
    const challengeRes = await getProtected();
    const wwwAuth = challengeRes.headers.get("www-authenticate")!;
    const [{ macaroon }] = parseAuthenticateHeader(wwwAuth);

    // L402 protocol-specification.md §6 Authorization header construction
    const authHeader = buildAuthorizationHeader({
      macaroons: macaroon,
      preimage: FIXTURE_PREIMAGE_HEX,
    });

    const authRes = await getProtected("/pokemon/1", { Authorization: authHeader });

    // strictverify=false: Aperture accepts any preimage without checking
    // sha256(preimage) == paymentHash, so 200 is expected.
    expect(authRes.status).toBe(200);
  });

  // --- Scenario 4 ---
  test("tampered macaroon is rejected by Aperture with 401", async () => {
    const challengeRes = await getProtected();
    const wwwAuth = challengeRes.headers.get("www-authenticate")!;
    const [{ macaroon }] = parseAuthenticateHeader(wwwAuth);

    // Flip the last character to corrupt the HMAC signature.
    const lastChar = macaroon.slice(-1);
    const tampered = macaroon.slice(0, -1) + (lastChar === "A" ? "B" : "A");

    const authHeader = buildAuthorizationHeader({
      macaroons: tampered,
      preimage: FIXTURE_PREIMAGE_HEX,
    });

    const authRes = await getProtected("/pokemon/1", { Authorization: authHeader });

    // Aperture must reject a tampered HMAC — signature check per
    // L402 macaroon-spec.md §Verification.
    expect(authRes.status).toBe(401);
  });

  // --- Scenario 5 ---
  test("L402 and LSAT scheme challenges both parse correctly", async () => {
    const res = await getProtected();
    const wwwAuth = res.headers.get("www-authenticate")!;

    // Aperture emits L402 scheme. Verify our parser accepts it.
    const l402Challenges = parseAuthenticateHeader(wwwAuth);
    expect(l402Challenges[0].scheme).toBe("L402");

    // Construct a synthetic LSAT-scheme header using the same tokens and verify
    // our parser also accepts the legacy scheme.
    // L402 protocol-specification.md §10 Backwards Compatibility
    const { macaroon, invoice } = l402Challenges[0];
    const lsatHeader = `LSAT macaroon="${macaroon}", invoice="${invoice}"`;
    const lsatChallenges = parseAuthenticateHeader(lsatHeader);
    expect(lsatChallenges[0].scheme).toBe("LSAT");
    expect(lsatChallenges[0].macaroon).toBe(macaroon);
    expect(lsatChallenges[0].invoice).toBe(invoice);
  });

  // --- Scenario 6 ---
  test("multi-macaroon Authorization header is parsed correctly", async () => {
    const res = await getProtected();
    const wwwAuth = res.headers.get("www-authenticate")!;
    const [{ macaroon }] = parseAuthenticateHeader(wwwAuth);

    // Build a multi-macaroon header by repeating the same token.
    // Real use would have two distinct macaroons (one per service).
    // We test parse acceptance here; Aperture acceptance is scenario 3.
    // L402 protocol-specification.md §6.3 Multi-macaroon
    const multiHeader = buildAuthorizationHeader({
      macaroons: [macaroon, macaroon],
      preimage: FIXTURE_PREIMAGE_HEX,
    });

    const parsed = parseAuthorizationHeader(multiHeader);
    expect(Array.isArray(parsed.macaroons)).toBe(true);
    expect(parsed.macaroons.length).toBe(2);
    expect(parsed.preimageHex).toBe(FIXTURE_PREIMAGE_HEX);
  });
});
