export interface CaveatFixture {
  name: string;
  source: string;
  input: string;
  expected:
    | {
        ok: true;
        caveat: {
          condition: string;
          value: string;
        };
        serialized: string;
      }
    | {
        ok: false;
        reason: string;
      };
}

export const specCaveatFixtures: CaveatFixture[] = [
  {
    name: "services-single",
    source: "L402 macaroon-spec.md Caveats / Services Caveat",
    input: "services=pokedex:0",
    expected: {
      ok: true,
      caveat: {
        condition: "services",
        value: "pokedex:0",
      },
      serialized: "services=pokedex:0",
    },
  },
  {
    name: "services-multiple",
    source: "L402 macaroon-spec.md Caveats / Services Caveat",
    input: "services=pokedex:0,proxy:0",
    expected: {
      ok: true,
      caveat: {
        condition: "services",
        value: "pokedex:0,proxy:0",
      },
      serialized: "services=pokedex:0,proxy:0",
    },
  },
  {
    name: "capabilities",
    source: "L402 macaroon-spec.md Caveats / Capabilities Caveat",
    input: "pokedex_capabilities=read,write",
    expected: {
      ok: true,
      caveat: {
        condition: "pokedex_capabilities",
        value: "read,write",
      },
      serialized: "pokedex_capabilities=read,write",
    },
  },
  {
    name: "constraint",
    source: "L402 macaroon-spec.md Caveats / Constraints",
    input: "request_max-count=10",
    expected: {
      ok: true,
      caveat: {
        condition: "request_max-count",
        value: "10",
      },
      serialized: "request_max-count=10",
    },
  },
  {
    name: "value-with-equals",
    source: "L402 macaroon-spec.md Caveats (condition=value string form)",
    input: "request_filter=a=b=c",
    expected: {
      ok: true,
      caveat: {
        condition: "request_filter",
        value: "a=b=c",
      },
      serialized: "request_filter=a=b=c",
    },
  },
  {
    name: "trim-around-separator",
    source: "L402 macaroon-spec.md Caveats (condition=value string form)",
    input: " services = pokedex:0 ",
    expected: {
      ok: true,
      caveat: {
        condition: "services",
        value: "pokedex:0",
      },
      serialized: "services=pokedex:0",
    },
  },
];

export const malformedCaveatFixtures: CaveatFixture[] = [
  {
    name: "empty-condition",
    source: "L402 macaroon-spec.md Caveats (condition=value string form)",
    input: "=pokedex:0",
    expected: {
      ok: false,
      reason: "empty-caveat-condition",
    },
  },
  {
    name: "missing-separator",
    source: "L402 macaroon-spec.md Caveats (condition=value string form)",
    input: "services",
    expected: {
      ok: false,
      reason: "missing-caveat-separator",
    },
  },
];
