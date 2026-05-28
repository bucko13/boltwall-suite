import { describe, expect, test } from "bun:test";

import {
  crossParserRoundTripFixtures,
  lsatJsCompatFixtures,
} from "@boltwall/test-fixtures";
import { buildAuthenticateHeaders } from "../src/build-authenticate-headers";
import { buildAuthorizationHeader } from "../src/build-authorization-header";
import { parseAuthenticateHeader } from "../src/parse-authenticate-header";
import { parseAuthorizationHeader } from "../src/parse-authorization-header";
import { parseCaveat } from "../src/caveats";

describe("lsat-js compatibility fixtures", () => {
  for (const fixture of lsatJsCompatFixtures) {
    test(fixture.name, () => {
      if (fixture.kind === "challenge" && fixture.expected.kind === "challenge") {
        expect(parseAuthenticateHeader(fixture.input)).toEqual([
          fixture.expected.fields,
        ]);
        return;
      }

      if (
        fixture.kind === "authorization" &&
        fixture.expected.kind === "authorization"
      ) {
        expect(parseAuthorizationHeader(fixture.input)).toEqual(
          fixture.expected.fields,
        );
        return;
      }

      if (fixture.kind === "caveat" && fixture.expected.kind === "caveat") {
        expect(parseCaveat(fixture.input)).toEqual(fixture.expected.fields);
        return;
      }

      throw new Error(`unhandled fixture kind: ${fixture.kind}`);
    });
  }
});

describe("cross-parser integration fixtures", () => {
  for (const fixture of crossParserRoundTripFixtures) {
    test(fixture.name, () => {
      const challenges = buildAuthenticateHeaders({
        macaroon: fixture.challenge.macaroon,
        invoice: fixture.challenge.invoice,
        compatibility: fixture.challenge.compatibility,
      });

      const parsedChallenges = parseAuthenticateHeader(challenges);
      expect(parsedChallenges.map((c) => c.scheme)).toEqual(
        fixture.challenge.expectedSchemes,
      );
      for (const parsed of parsedChallenges) {
        expect(parsed.macaroon).toBe(fixture.challenge.macaroon);
        expect(parsed.invoice).toBe(fixture.challenge.invoice);
      }

      const authorization = buildAuthorizationHeader({
        macaroons: fixture.authorization.macaroons,
        preimage: fixture.authorization.preimage,
        legacy: fixture.authorization.scheme === "LSAT",
      });
      expect(parseAuthorizationHeader(authorization)).toEqual({
        scheme: fixture.authorization.scheme,
        macaroons: fixture.authorization.macaroons,
        preimage: fixture.authorization.preimage,
      });
    });
  }
});
