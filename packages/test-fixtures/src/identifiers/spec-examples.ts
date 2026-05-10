export interface IdentifierFixture {
  name: string;
  source: string;
  macaroon: string;
  expected:
    | {
        ok: true;
        fields: {
          version: 0;
          paymentHashHex: string;
          tokenIdHex: string;
        };
      }
    | {
        ok: false;
        reason: string;
      };
}

export const IDENTIFIER_PAYMENT_HASH_HEX =
  "00112233445566778899aabbccddeeff102132435465768798a9babbdcddfeff";

export const IDENTIFIER_TOKEN_ID_HEX =
  "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

export const ZERO_PAYMENT_HASH_HEX =
  "0000000000000000000000000000000000000000000000000000000000000000";

export const FF_TOKEN_ID_HEX =
  "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    if (a === undefined) {
      break;
    }

    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += alphabet[(n >> 18) & 0x3f] ?? "";
    out += alphabet[(n >> 12) & 0x3f] ?? "";
    out += b === undefined ? "=" : alphabet[(n >> 6) & 0x3f] ?? "";
    out += c === undefined ? "=" : alphabet[n & 0x3f] ?? "";
  }

  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function v2MacaroonWithIdentifier(identifier: Uint8Array): string {
  return bytesToBase64(
    new Uint8Array([
      0x02,
      0x02,
      identifier.length,
      ...identifier,
      0x00,
      0x06,
      0x20,
      ...new Uint8Array(32),
      0x00,
    ]),
  );
}

function identifierBytes(args: {
  version?: number;
  paymentHashHex?: string;
  tokenIdHex?: string;
}): Uint8Array {
  const version = args.version ?? 0;
  const paymentHash = hexToBytes(args.paymentHashHex ?? IDENTIFIER_PAYMENT_HASH_HEX);
  const tokenId = hexToBytes(args.tokenIdHex ?? IDENTIFIER_TOKEN_ID_HEX);
  return new Uint8Array([
    (version >> 8) & 0xff,
    version & 0xff,
    ...paymentHash,
    ...tokenId,
  ]);
}

export const specIdentifierFixtures: IdentifierFixture[] = [
  {
    name: "v0-66-byte-identifier",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(identifierBytes({})),
    expected: {
      ok: true,
      fields: {
        version: 0,
        paymentHashHex: IDENTIFIER_PAYMENT_HASH_HEX,
        tokenIdHex: IDENTIFIER_TOKEN_ID_HEX,
      },
    },
  },
  {
    name: "zero-payment-hash-boundary",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(
      identifierBytes({ paymentHashHex: ZERO_PAYMENT_HASH_HEX }),
    ),
    expected: {
      ok: true,
      fields: {
        version: 0,
        paymentHashHex: ZERO_PAYMENT_HASH_HEX,
        tokenIdHex: IDENTIFIER_TOKEN_ID_HEX,
      },
    },
  },
  {
    name: "ff-token-id-boundary",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(identifierBytes({ tokenIdHex: FF_TOKEN_ID_HEX })),
    expected: {
      ok: true,
      fields: {
        version: 0,
        paymentHashHex: IDENTIFIER_PAYMENT_HASH_HEX,
        tokenIdHex: FF_TOKEN_ID_HEX,
      },
    },
  },
];

export const malformedIdentifierFixtures: IdentifierFixture[] = [
  {
    name: "identifier-65-bytes",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(identifierBytes({}).slice(0, 65)),
    expected: {
      ok: false,
      reason: "invalid-identifier-length",
    },
  },
  {
    name: "identifier-67-bytes",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(
      new Uint8Array([...identifierBytes({}), 0x00]),
    ),
    expected: {
      ok: false,
      reason: "invalid-identifier-length",
    },
  },
  {
    name: "identifier-version-1",
    source: "L402 macaroon-spec.md Identifier Structure / Version 0 Format",
    macaroon: v2MacaroonWithIdentifier(identifierBytes({ version: 1 })),
    expected: {
      ok: false,
      reason: "unsupported-identifier-version",
    },
  },
];
