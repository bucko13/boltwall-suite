import { expect, test } from "@playwright/test";

import {
  BOLT11_SPEC_EXAMPLES,
  malformedIdentifierFixtures,
  macaroonCodecFixtures,
  multiMacaroonAuthorizationFixtures,
  specChallengeFixtures,
  specIdentifierFixtures,
  specPreimageFixtures,
} from "@boltwall/test-fixtures";

const challengeFixture = specChallengeFixtures.find(
  (fixture) => fixture.name === "spec-5-1-example-real-values",
);
const authorizationFixture = multiMacaroonAuthorizationFixtures.find(
  (fixture) => fixture.name === "two-macaroons-no-whitespace",
);
const identifierFixture = specIdentifierFixtures.find(
  (fixture) => fixture.name === "v0-66-byte-identifier",
);
const malformedIdentifierFixture = malformedIdentifierFixtures.find(
  (fixture) => fixture.name === "identifier-65-bytes",
);
const invoiceFixture = BOLT11_SPEC_EXAMPLES.find(
  (fixture) => fixture.name === "bolt11-spec-microbtc-mainnet",
);
const goodPreimageFixture = specPreimageFixtures.find(
  (fixture) => fixture.name === "zero-preimage-canonical",
);
const badPreimageFixture = specPreimageFixtures.find(
  (fixture) => fixture.name === "near-miss-rejects",
);
const macaroonFixture = macaroonCodecFixtures.find(
  (fixture) => fixture.name === "v0-identifier-standard-caveats",
);

if (
  challengeFixture === undefined ||
  challengeFixture.expected.ok !== true ||
  authorizationFixture === undefined ||
  authorizationFixture.expected.ok !== true ||
  identifierFixture === undefined ||
  identifierFixture.expected.ok !== true ||
  malformedIdentifierFixture === undefined ||
  malformedIdentifierFixture.expected.ok !== false ||
  invoiceFixture === undefined ||
  goodPreimageFixture === undefined ||
  badPreimageFixture === undefined ||
  macaroonFixture === undefined
) {
  throw new Error("missing-browser-import-fixtures");
}

test("built ESM imports in Chromium and exercises L402 browser-safe APIs", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ""}`);
  });

  await page.goto("/");

  const result = await page.evaluate(
    async (fixtures) => {
      const l402 = await import("/index.js");
      const macaroonCodec = await import("/internal/macaroon.js");

      const challenge = l402.parseAuthenticateHeader(fixtures.challenge.header);
      const authorization = l402.parseAuthorizationHeader(
        fixtures.authorization.header,
      );
      const identifier = l402.decodeIdentifier(fixtures.identifier.macaroon);
      const invoice = l402.decodeBolt11Invoice(fixtures.invoice.invoice);
      const preimageOk = l402.verifyPreimage({
        paymentHash: fixtures.goodPreimage.paymentHashHex,
        preimage: fixtures.goodPreimage.preimageHex,
      });
      const preimageRejected = l402.verifyPreimage({
        paymentHash: fixtures.badPreimage.paymentHashHex,
        preimage: fixtures.badPreimage.preimageHex,
      });
      const caveat = l402.parseCaveat("services=pokedex:0");
      const rawMacaroon = macaroonCodec.mintRaw({
        rootKey: hexToBytes(fixtures.macaroon.rootKeyHex),
        identifier: hexToBytes(fixtures.macaroon.identifierHex),
        caveats: fixtures.macaroon.caveatHexes.map(hexToBytes),
      });
      const encodedMacaroon = macaroonCodec.encodeRaw(rawMacaroon);
      const decodedMacaroon = macaroonCodec.decodeRaw(encodedMacaroon);
      const macaroonVerified = macaroonCodec.verifyRawSignature({
        macaroon: decodedMacaroon,
        rootKey: hexToBytes(fixtures.macaroon.rootKeyHex),
      });
      const attenuatedMacaroon = macaroonCodec.addFirstPartyCaveat(
        decodedMacaroon,
        new TextEncoder().encode("route=/pokemon/*"),
      );

      let invalidIdentifierReason = "";
      try {
        l402.decodeIdentifier(fixtures.malformedIdentifier.macaroon);
      } catch (error) {
        invalidIdentifierReason =
          error instanceof Error ? error.message : String(error);
      }

      return {
        exported: {
          parseAuthenticateHeader: typeof l402.parseAuthenticateHeader,
          parseAuthorizationHeader: typeof l402.parseAuthorizationHeader,
          decodeIdentifier: typeof l402.decodeIdentifier,
          decodeBolt11Invoice: typeof l402.decodeBolt11Invoice,
          verifyPreimage: typeof l402.verifyPreimage,
          parseCaveat: typeof l402.parseCaveat,
          mintRaw: typeof macaroonCodec.mintRaw,
        },
        challenge,
        authorization,
        identifier: {
          version: identifier.version,
          paymentHashHex: bytesToHex(identifier.paymentHash),
          tokenIdHex: bytesToHex(identifier.tokenId),
        },
        invalidIdentifierReason,
        invoice: {
          paymentHashHex: invoice.paymentHashHex,
          amountMsat: invoice.amountMsat.toString(),
          description: invoice.description,
          network: invoice.network,
        },
        preimageOk,
        preimageRejected,
        caveat,
        macaroon: {
          caveatCount: decodedMacaroon.caveats.length,
          signatureLength: decodedMacaroon.signature.length,
          verified: macaroonVerified,
          attenuatedCaveatCount: attenuatedMacaroon.caveats.length,
        },
      };

      function hexToBytes(hex: string): Uint8Array {
        const out = new Uint8Array(hex.length / 2);
        for (let i = 0; i < out.length; i++) {
          out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return out;
      }

      function bytesToHex(bytes: Uint8Array): string {
        return Array.from(bytes, (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
      }
    },
    {
      challenge: challengeFixture,
      authorization: authorizationFixture,
      identifier: identifierFixture,
      malformedIdentifier: malformedIdentifierFixture,
      invoice: invoiceFixture,
      goodPreimage: goodPreimageFixture,
      badPreimage: badPreimageFixture,
      macaroon: macaroonFixture,
    },
  );

  expect(result.exported).toEqual({
    parseAuthenticateHeader: "function",
    parseAuthorizationHeader: "function",
    decodeIdentifier: "function",
    decodeBolt11Invoice: "function",
    verifyPreimage: "function",
    parseCaveat: "function",
    mintRaw: "function",
  });

  expect(result.challenge).toEqual(challengeFixture.expected.fields);
  expect(result.authorization.macaroons).toHaveLength(2);
  expect(result.authorization).toEqual(authorizationFixture.expected.fields);
  expect(result.identifier).toEqual(identifierFixture.expected.fields);
  expect(result.invalidIdentifierReason).toBe(
    malformedIdentifierFixture.expected.reason,
  );
  expect(result.invoice).toEqual({
    paymentHashHex: invoiceFixture.paymentHashHex,
    amountMsat: invoiceFixture.amountMsat.toString(),
    description: invoiceFixture.description,
    network: invoiceFixture.network,
  });
  expect(result.preimageOk).toBe(true);
  expect(result.preimageRejected).toBe(false);
  expect(result.caveat).toEqual({ condition: "services", value: "pokedex:0" });
  expect(result.macaroon).toEqual({
    caveatCount: 2,
    signatureLength: 32,
    verified: true,
    attenuatedCaveatCount: 3,
  });

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
