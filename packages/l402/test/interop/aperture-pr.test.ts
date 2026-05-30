/**
 * Aperture interop tests for PR checks.
 *
 * Guards: only runs when APERTURE_INTEROP=1 is set. Expects Aperture to be
 * reachable at APERTURE_URL (default http://localhost:8081) with the
 * docker-compose stack in packages/test-fixtures/aperture-smoke/ running.
 *
 * L402 spec references are cited inline per AGENTS.md RULE.
 *
 * Scenarios:
 *   1. GET protected endpoint → 402 with parseable L402 challenge.
 *   2. Challenge macaroon → Identifier extracts valid v0 identifier.
 *   3. Authorization header built from challenge macaroon → Aperture accepts it
 *      (strictverify=false in test config skips payment-hash proof).
 *   4. Tampered macaroon → Aperture returns 401, not 200.
 *   5. Dual-scheme challenge → both L402 and LSAT object parsing works.
 *   6. Multi-macaroon credential → L402.fromToken accepts it.
 */

import { describe, expect, test } from "bun:test";

import { Identifier, L402 } from "../../src";

// Hard guard: this file must only be run via `bun run test:interop`.
// It is intentionally excluded from the default `bun test` glob so it never
// appears as a skip in normal test output. If someone runs it directly
// without the flag, fail loudly rather than silently no-op.
if (process.env.APERTURE_INTEROP !== "1") {
  throw new Error(
    "Run interop tests with: bun run test:interop (from packages/l402)\n" +
    "Requires Docker + LND regtest. See CONTRIBUTING.md (Tests) and the @boltwall/l402 README.",
  );
}

const BASE = process.env.APERTURE_URL ?? "http://localhost:8081";

// A valid-looking 32-byte hex preimage. With strictverify=false Aperture
// does not check whether sha256(preimage) == paymentHash, so any value works
// for integration-level header acceptance testing.
// L402 protocol-specification.md §6 Authorization
const FIXTURE_PREIMAGE_HEX = "0".repeat(64);

async function getProtected(path = "/pokemon/1", headers: Record<string, string> = {}) {
  return fetch(`${BASE}${path}`, { headers });
}

describe("Aperture interop — PR check", () => {
  // --- Scenario 1 ---
  test("GET protected resource returns 402 with L402 WWW-Authenticate", async () => {
    const res = await getProtected();

    expect(res.status).toBe(402);

    const wwwAuth = res.headers.get("www-authenticate");
    expect(wwwAuth).toBeTruthy();

    // L402 protocol-specification.md §5 Challenge
    const challenge = L402.fromHeader(wwwAuth!);
    expect(typeof challenge.macaroon).toBe("string");
    expect(challenge.macaroon.length).toBeGreaterThan(0);
    expect(typeof challenge.invoice).toBe("string");
    expect(challenge.invoice?.length).toBeGreaterThan(0);
  });

  // --- Scenario 2 ---
  test("challenge macaroon decodes to valid v0 identifier", async () => {
    const res = await getProtected();
    const wwwAuth = res.headers.get("www-authenticate")!;
    const { macaroon } = L402.fromHeader(wwwAuth);

    // L402 macaroon-spec.md §Identifier Structure
    const id = Identifier.fromMacaroon(macaroon);
    expect(id.version).toBe(0);
    expect(id.paymentHash).toHaveLength(32);
    expect(id.tokenId).toHaveLength(32);
  });

  // --- Scenario 3 ---
  test("Authorization header built from challenge macaroon is accepted by Aperture", async () => {
    const challengeRes = await getProtected();
    const wwwAuth = challengeRes.headers.get("www-authenticate")!;
    const { macaroon } = L402.fromHeader(wwwAuth);

    // L402 protocol-specification.md §6 Authorization header construction
    const authHeader = new L402({
      macaroons: macaroon,
      paymentPreimage: FIXTURE_PREIMAGE_HEX,
    }).toAuthorizationHeader();

    const authRes = await getProtected("/pokemon/1", { Authorization: authHeader });

    // strictverify=false: Aperture accepts any preimage without checking
    // sha256(preimage) == paymentHash, so 200 is expected.
    expect(authRes.status).toBe(200);
  });

  // --- Scenario 4 ---
  test("tampered macaroon is rejected by Aperture with 401", async () => {
    const challengeRes = await getProtected();
    const wwwAuth = challengeRes.headers.get("www-authenticate")!;
    const { macaroon } = L402.fromHeader(wwwAuth);

    // Flip the last character to corrupt the HMAC signature.
    const lastChar = macaroon.slice(-1);
    const tampered = macaroon.slice(0, -1) + (lastChar === "A" ? "B" : "A");

    const authHeader = new L402({
      macaroons: tampered,
      paymentPreimage: FIXTURE_PREIMAGE_HEX,
    }).toAuthorizationHeader();

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
    const l402Challenge = L402.fromHeader(wwwAuth);
    expect(l402Challenge.macaroon).toBeTruthy();

    // Construct a synthetic LSAT-scheme header using the same tokens and verify
    // our parser also accepts the legacy scheme.
    // L402 protocol-specification.md §10 Backwards Compatibility
    const { macaroon, invoice } = l402Challenge;
    const lsatHeader = `LSAT macaroon="${macaroon}", invoice="${invoice}"`;
    const lsatChallenge = L402.fromHeader(lsatHeader);
    expect(lsatChallenge.toChallenge({ legacy: true })).toBe(lsatHeader);
    expect(lsatChallenge.macaroon).toBe(macaroon);
    expect(lsatChallenge.invoice).toBe(invoice);
  });

  // --- Scenario 6 ---
  test("multi-macaroon Authorization header is parsed correctly", async () => {
    const res = await getProtected();
    const wwwAuth = res.headers.get("www-authenticate")!;
    const { macaroon } = L402.fromHeader(wwwAuth);

    // Build a multi-macaroon header by repeating the same token.
    // Real use would have two distinct macaroons (one per service).
    // We test parse acceptance here; Aperture acceptance is scenario 3.
    // L402 protocol-specification.md §5.3 Grammar: macaroons are a CSV
    // credential component before the preimage separator.
    const multiHeader = new L402({
      macaroons: [macaroon, macaroon],
      paymentPreimage: FIXTURE_PREIMAGE_HEX,
    }).toAuthorizationHeader();

    const parsed = L402.fromToken(multiHeader);
    expect(parsed.macaroons.length).toBe(2);
    expect(parsed.paymentPreimage).toBe(FIXTURE_PREIMAGE_HEX);
  });
});
