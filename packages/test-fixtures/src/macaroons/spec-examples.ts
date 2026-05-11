export interface MacaroonCodecFixture {
  name: string;
  source: string;
  rootKeyHex: string;
  identifierHex: string;
  caveatHexes: string[];
}

export const macaroonCodecFixtures: MacaroonCodecFixture[] = [
  {
    name: "v0-identifier-no-caveats",
    source:
      "L402 macaroon-spec.md §Identifier Structure and §HMAC Chain Construction",
    rootKeyHex:
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    identifierHex:
      "000001010101010101010101010101010101010101010101010101010101010101012020202020202020202020202020202020202020202020202020202020202020",
    caveatHexes: [],
  },
  {
    name: "v0-identifier-standard-caveats",
    source:
      "L402 macaroon-spec.md §Caveat Format and §Serialization Formats / Macaroon V2 Binary Format",
    rootKeyHex:
      "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100",
    identifierHex:
      "0000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    caveatHexes: [
      "73657276696365733d706f6b656465783a30",
      "706f6b656465785f6361706162696c69746965733d72656164",
    ],
  },
];
