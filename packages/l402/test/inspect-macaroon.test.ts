import { describe, expect, test } from "bun:test";

import { malformedIdentifierFixtures } from "@boltwall/test-fixtures";

import { inspectMacaroon, mintMacaroon } from "../src";
import { encodeRaw, mintRaw } from "../src/internal/macaroon";

describe("inspectMacaroon", () => {
  test("returns identifier, caveat, and signature fields from a base64 V2 macaroon", () => {
    const paymentHash = repeatedBytes(0x33);
    const tokenId = repeatedBytes(0x22);
    const macaroon = mintMacaroon({
      rootKey: repeatedBytes(0x11),
      identifier: {
        version: 0,
        paymentHash,
        tokenId,
      },
      caveats: [
        { condition: "services", value: "pokedex:0" },
        { condition: "pokedex_capabilities", value: "read" },
      ],
    });

    const inspection = inspectMacaroon(macaroon);

    expect(inspection.identifier.version).toBe(0);
    expect(bytesToHex(inspection.identifier.paymentHash)).toBe(bytesToHex(paymentHash));
    expect(bytesToHex(inspection.identifier.tokenId)).toBe(bytesToHex(tokenId));
    expect(inspection.identifierBytes).toHaveLength(66);
    expect(inspection.signature).toHaveLength(32);
    expect(inspection.caveats.map(({ condition, value, text }) => ({ condition, value, text })))
      .toEqual([
        { condition: "services", value: "pokedex:0", text: "services=pokedex:0" },
        {
          condition: "pokedex_capabilities",
          value: "read",
          text: "pokedex_capabilities=read",
        },
      ]);
    expect(inspection.caveats[0]?.parsed).toEqual({
      condition: "services",
      value: "pokedex:0",
    });
    expect(inspection.caveats[0]?.raw).toBeInstanceOf(Uint8Array);
  });

  test("keeps malformed caveat text inspectable without reporting it as parsed", () => {
    const raw = mintRaw({
      rootKey: repeatedBytes(0x11),
      identifier: identifierBytes({
        paymentHash: repeatedBytes(0x33),
        tokenId: repeatedBytes(0x22),
      }),
      caveats: [new TextEncoder().encode("not-a-key-value-caveat")],
    });

    const inspection = inspectMacaroon(encodeRaw(raw));

    expect(inspection.caveats).toHaveLength(1);
    expect(inspection.caveats[0]).toMatchObject({
      text: "not-a-key-value-caveat",
      condition: "not-a-key-value-caveat",
      value: "",
      parsed: null,
    });
  });

  test("rejects malformed macaroon and identifier inputs through the protocol decoder", () => {
    expect(() => inspectMacaroon("not base64!?")).toThrow("invalid-macaroon-base64");

    const malformedIdentifier = malformedIdentifierFixtures.find(
      (fixture) => fixture.name === "identifier-65-bytes",
    );
    if (malformedIdentifier === undefined || malformedIdentifier.expected.ok !== false) {
      throw new Error("missing-malformed-identifier-fixture");
    }

    expect(() => inspectMacaroon(malformedIdentifier.macaroon)).toThrow();
  });
});

function identifierBytes(args: { paymentHash: Uint8Array; tokenId: Uint8Array }): Uint8Array {
  const bytes = new Uint8Array(66);
  bytes.set(args.paymentHash, 2);
  bytes.set(args.tokenId, 34);
  return bytes;
}

function repeatedBytes(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
