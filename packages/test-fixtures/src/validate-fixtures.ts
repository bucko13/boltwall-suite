import {
  crossParserRoundTripFixtures,
  legacyLsatAuthorizationFixtures,
  lsatJsCompatFixtures,
  malformedAuthorizationFixtures,
  multiMacaroonAuthorizationFixtures,
  specAuthorizationFixtures,
  type AuthorizationFixture,
} from "./index";

const authorizationGroups: Array<{
  name: string;
  fixtures: AuthorizationFixture[];
}> = [
  { name: "spec", fixtures: specAuthorizationFixtures },
  { name: "multi-macaroon", fixtures: multiMacaroonAuthorizationFixtures },
  { name: "legacy-lsat", fixtures: legacyLsatAuthorizationFixtures },
  { name: "malformed", fixtures: malformedAuthorizationFixtures },
];

const schemeRe = /^(L402|LSAT) +(.+)$/i;
const base64Re = /^[A-Za-z0-9+/]+={0,2}$/;
const hexRe = /^[0-9a-fA-F]+$/;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function assertUniqueFixtureNames(group: string, names: string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    assert(name.length > 0, `${group}: fixture names must be non-empty`);
    assert(!seen.has(name), `${group}: duplicate fixture name ${name}`);
    seen.add(name);
  }
}

function assertAuthorizationSource(fixture: AuthorizationFixture): void {
  assert(
    fixture.source.includes("L402 protocol-specification.md §") ||
      fixture.source.includes("Tierion/lsat-js"),
    `${fixture.name}: source must cite a spec section or MIT lsat-js reference`,
  );
}

function assertValidAuthorizationFixture(fixture: AuthorizationFixture): void {
  const match = schemeRe.exec(fixture.header);
  if (match === null) {
    throw new Error(`${fixture.name}: valid fixture must include scheme + 1*SP`);
  }
  const body = match[2];
  if (body === undefined) {
    throw new Error(`${fixture.name}: missing credential body`);
  }

  // L402 protocol-specification.md §5.3 Grammar:
  // l402-credential = "L402" 1*SP macaroons ":" preimage
  assert(
    !/\s/.test(body),
    `${fixture.name}: credential body must not contain whitespace`,
  );

  const colonIndex = body.indexOf(":");
  assert(colonIndex >= 0, `${fixture.name}: missing macaroon/preimage colon`);
  assert(
    colonIndex === body.lastIndexOf(":"),
    `${fixture.name}: credential must contain exactly one colon`,
  );

  const macaroons = body.slice(0, colonIndex).split(",");
  const preimage = body.slice(colonIndex + 1);
  assert(macaroons.length > 0, `${fixture.name}: missing macaroons`);
  for (const macaroon of macaroons) {
    assert(macaroon.length > 0, `${fixture.name}: empty macaroon in list`);
    assert(base64Re.test(macaroon), `${fixture.name}: macaroon is not base64`);
  }
  assert(preimage.length > 0, `${fixture.name}: missing preimage`);
  assert(preimage.length === 64, `${fixture.name}: preimage must be 32 bytes hex`);
  assert(hexRe.test(preimage), `${fixture.name}: preimage is not hex`);
}

for (const group of authorizationGroups) {
  assertUniqueFixtureNames(
    `authorization/${group.name}`,
    group.fixtures.map((fixture) => fixture.name),
  );

  for (const fixture of group.fixtures) {
    assertAuthorizationSource(fixture);
    if (fixture.expected.ok) {
      assertValidAuthorizationFixture(fixture);
    }
  }
}

assertUniqueFixtureNames(
  "cross-parser",
  crossParserRoundTripFixtures.map((fixture) => fixture.name),
);
assert(crossParserRoundTripFixtures.length > 0, "cross-parser fixtures must export");

assertUniqueFixtureNames(
  "lsat-js-compat",
  lsatJsCompatFixtures.map((fixture) => fixture.name),
);
assert(lsatJsCompatFixtures.length > 0, "lsat-js compat fixtures must export");
