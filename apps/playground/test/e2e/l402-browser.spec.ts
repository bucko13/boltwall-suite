/**
 * Browser-executed L402 API coverage for the playground.
 *
 * Validates that @boltwall/l402 functions imported by the Next.js bundle
 * work correctly in Chromium, confirming no bundler shim or runtime issue
 * breaks the APIs that the playground UI depends on.
 *
 * Fixture selection mirrors packages/l402/test/browser/import.spec.ts so
 * divergence between the two surfaces is immediately visible.
 */
import { expect, test } from "@playwright/test";

import {
  BOLT11_SPEC_EXAMPLES,
  malformedIdentifierFixtures,
  multiMacaroonAuthorizationFixtures,
  specChallengeFixtures,
  specIdentifierFixtures,
  specPreimageFixtures,
} from "@boltwall/test-fixtures";

// --- fixture selection ---

const challengeFixture = specChallengeFixtures.find(
  (f) => f.name === "spec-5-1-example-real-values",
);
const authorizationFixture = multiMacaroonAuthorizationFixtures.find(
  (f) => f.name === "two-macaroons-no-whitespace",
);
const identifierFixture = specIdentifierFixtures.find((f) => f.name === "v0-66-byte-identifier");
const malformedIdentifierFixture = malformedIdentifierFixtures.find(
  (f) => f.name === "identifier-65-bytes",
);
const invoiceFixture = BOLT11_SPEC_EXAMPLES.find((f) => f.name === "bolt11-spec-microbtc-mainnet");
const goodPreimageFixture = specPreimageFixtures.find((f) => f.name === "zero-preimage-canonical");
const badPreimageFixture = specPreimageFixtures.find((f) => f.name === "near-miss-rejects");

if (
  !challengeFixture ||
  challengeFixture.expected.ok !== true ||
  !authorizationFixture ||
  authorizationFixture.expected.ok !== true ||
  !identifierFixture ||
  identifierFixture.expected.ok !== true ||
  !malformedIdentifierFixture ||
  malformedIdentifierFixture.expected.ok !== false ||
  !invoiceFixture ||
  !goodPreimageFixture ||
  !badPreimageFixture
) {
  throw new Error("missing required browser-validation fixtures");
}

const challengeExpectedFields =
  challengeFixture.expected.ok === true ? challengeFixture.expected.fields : undefined;
const authorizationExpectedFields =
  authorizationFixture.expected.ok === true ? authorizationFixture.expected.fields : undefined;
const identifierExpectedFields =
  identifierFixture.expected.ok === true ? identifierFixture.expected.fields : undefined;
const malformedIdentifierReason =
  malformedIdentifierFixture.expected.ok === false
    ? malformedIdentifierFixture.expected.reason
    : undefined;

if (
  !challengeExpectedFields ||
  !authorizationExpectedFields ||
  !identifierExpectedFields ||
  !malformedIdentifierReason
) {
  throw new Error("unexpected browser-validation fixture shape");
}

test.describe("L402 browser validation / playground bundle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/test-l402");
    await expect(page.locator("[data-testid='l402-test-ready']")).toBeVisible();
  });

  test("parseAuthenticateHeader parses L402 challenge", async ({ page }) => {
    const result = await page.evaluate((header: string) => {
      return window.__l402!.parseAuthenticateHeader(header);
    }, challengeFixture.header);

    expect(result).toEqual(challengeExpectedFields);
  });

  test("parseAuthorizationHeader parses multi-macaroon credential", async ({ page }) => {
    const result = await page.evaluate((header: string) => {
      return window.__l402!.parseAuthorizationHeader(header);
    }, authorizationFixture.header);

    expect(result.macaroons).toHaveLength(2);
    expect(result).toEqual(authorizationExpectedFields);
  });

  test("L402 object workflow parses challenges and serializes credentials", async ({ page }) => {
    const result = await page.evaluate(
      ({
        challengeHeader,
        authorizationHeader,
      }: {
        challengeHeader: string;
        authorizationHeader: string;
      }) => {
        const challenge = window.__l402!.L402.fromHeader(challengeHeader);
        const credential = window.__l402!.L402.fromToken(authorizationHeader);
        return {
          exported: typeof window.__l402!.L402,
          challenge: {
            macaroon: challenge.macaroon,
            invoice: challenge.invoice,
            header: challenge.toChallenge(),
            authenticateHeaders: challenge.toAuthenticateHeaders(),
          },
          credential: {
            macaroons: credential.macaroons,
            authorizationHeader: credential.toAuthorizationHeader(),
          },
        };
      },
      {
        challengeHeader: challengeFixture.header,
        authorizationHeader: authorizationFixture.header,
      },
    );

    expect(result.exported).toBe("function");
    expect(result.challenge).toEqual({
      macaroon: challengeExpectedFields[0]?.macaroon,
      invoice: challengeExpectedFields[0]?.invoice,
      header: challengeFixture.header,
      authenticateHeaders: [
        challengeFixture.header.replace(/^L402 /, "LSAT "),
        challengeFixture.header,
      ],
    });
    expect(result.credential).toEqual({
      macaroons: authorizationExpectedFields.macaroons,
      authorizationHeader: authorizationFixture.header,
    });
  });

  test("decodeIdentifier extracts paymentHash and tokenId", async ({ page }) => {
    const result = await page.evaluate((macaroon: string) => {
      const id = window.__l402!.decodeIdentifier(macaroon);
      const hex = (b: Uint8Array) =>
        Array.from(b, (byte) => byte.toString(16).padStart(2, "0")).join("");
      return {
        version: id.version,
        paymentHashHex: hex(id.paymentHash),
        tokenIdHex: hex(id.tokenId),
      };
    }, identifierFixture.macaroon);

    expect(result).toEqual(identifierExpectedFields);
  });

  test("decodeIdentifier throws on malformed input", async ({ page }) => {
    const reason = await page.evaluate((macaroon: string) => {
      try {
        window.__l402!.decodeIdentifier(macaroon);
        return "";
      } catch (e) {
        return e instanceof Error ? e.message : String(e);
      }
    }, malformedIdentifierFixture.macaroon);

    expect(reason).toBe(malformedIdentifierReason);
  });

  test("decodeBolt11Invoice returns bigint amountMsat in browser", async ({ page }) => {
    const result = await page.evaluate((invoice: string) => {
      const decoded = window.__l402!.decodeBolt11Invoice(invoice);
      return {
        paymentHashHex: decoded.paymentHashHex,
        // BigInt is not JSON-serialisable; stringify before crossing the boundary.
        amountMsat: decoded.amountMsat.toString(),
        description: decoded.description,
        network: decoded.network,
      };
    }, invoiceFixture.invoice);

    expect(result).toEqual({
      paymentHashHex: invoiceFixture.paymentHashHex,
      amountMsat: invoiceFixture.amountMsat.toString(),
      description: invoiceFixture.description,
      network: invoiceFixture.network,
    });
  });

  test("verifyPreimage accepts correct preimage, rejects near-miss", async ({ page }) => {
    const preimageCases: [
      { paymentHashHex: string; preimageHex: string },
      { paymentHashHex: string; preimageHex: string },
    ] = [
      {
        paymentHashHex: goodPreimageFixture.paymentHashHex,
        preimageHex: goodPreimageFixture.preimageHex,
      },
      {
        paymentHashHex: badPreimageFixture.paymentHashHex,
        preimageHex: badPreimageFixture.preimageHex,
      },
    ];

    const [ok, rejected] = await page.evaluate(
      ([good, bad]: [
        { paymentHashHex: string; preimageHex: string },
        { paymentHashHex: string; preimageHex: string },
      ]) => {
        return [
          window.__l402!.verifyPreimage({
            paymentHash: good.paymentHashHex,
            preimage: good.preimageHex,
          }),
          window.__l402!.verifyPreimage({
            paymentHash: bad.paymentHashHex,
            preimage: bad.preimageHex,
          }),
        ];
      },
      preimageCases,
    );

    expect(ok).toBe(true);
    expect(rejected).toBe(false);
  });
});
