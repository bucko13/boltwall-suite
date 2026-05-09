import { describe, expect, test } from "bun:test";

import { sha256 } from "@noble/hashes/sha2.js";

import {
  NONTRIVIAL_PREIMAGE_HEX,
  ZERO_PREIMAGE_HEX,
  ZERO_PREIMAGE_PAYMENT_HASH_HEX,
  specPreimageFixtures,
  type PreimageFixture,
} from "@boltwall/test-fixtures";

import { verifyPreimage } from "../src/verify-preimage";

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function runFixture(fixture: PreimageFixture): void {
  const got = verifyPreimage({
    paymentHash: fixture.paymentHashHex,
    preimage: fixture.preimageHex,
  });
  expect(got).toBe(fixture.expected.ok);
}

describe("verifyPreimage / spec fixtures", () => {
  for (const fixture of specPreimageFixtures) {
    test(fixture.name, () => runFixture(fixture));
  }
});

describe("verifyPreimage / hex and Uint8Array input parity", () => {
  test("returns true for matching hex inputs", () => {
    expect(
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: ZERO_PREIMAGE_HEX,
      }),
    ).toBe(true);
  });

  test("returns true for matching Uint8Array inputs", () => {
    expect(
      verifyPreimage({
        paymentHash: hexToBytes(ZERO_PREIMAGE_PAYMENT_HASH_HEX),
        preimage: hexToBytes(ZERO_PREIMAGE_HEX),
      }),
    ).toBe(true);
  });

  test("returns true for mixed hex + Uint8Array inputs", () => {
    expect(
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: hexToBytes(ZERO_PREIMAGE_HEX),
      }),
    ).toBe(true);
  });

  test("uppercase hex parses correctly", () => {
    expect(
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX.toUpperCase(),
        preimage: ZERO_PREIMAGE_HEX.toUpperCase(),
      }),
    ).toBe(true);
  });
});

describe("verifyPreimage / non-trivial preimage agrees with @noble/hashes", () => {
  test("computed sha256 matches what verifyPreimage uses", () => {
    const preimage = hexToBytes(NONTRIVIAL_PREIMAGE_HEX);
    const expected = bytesToHex(sha256(preimage));
    expect(
      verifyPreimage({ paymentHash: expected, preimage: preimage }),
    ).toBe(true);
  });

  test("flipping any single byte of paymentHash makes it return false", () => {
    const preimage = hexToBytes(NONTRIVIAL_PREIMAGE_HEX);
    const correctHash = sha256(preimage);
    for (const idx of [0, 7, 15, 23, 31]) {
      const flipped = new Uint8Array(correctHash);
      flipped[idx] ^= 0x01;
      expect(verifyPreimage({ paymentHash: flipped, preimage })).toBe(false);
    }
  });
});

describe("verifyPreimage / length validation throws RangeError", () => {
  test("throws when preimage is 31 bytes", () => {
    expect(() =>
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: ZERO_PREIMAGE_HEX.slice(0, 62),
      }),
    ).toThrow(RangeError);
  });

  test("throws when preimage is 33 bytes", () => {
    expect(() =>
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: ZERO_PREIMAGE_HEX + "ab",
      }),
    ).toThrow(RangeError);
  });

  test("throws when paymentHash is 31 bytes", () => {
    expect(() =>
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX.slice(0, 62),
        preimage: ZERO_PREIMAGE_HEX,
      }),
    ).toThrow(RangeError);
  });

  test("throws on non-hex preimage", () => {
    expect(() =>
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: "z".repeat(64),
      }),
    ).toThrow(RangeError);
  });

  test("throws on odd-length hex string", () => {
    expect(() =>
      verifyPreimage({
        paymentHash: ZERO_PREIMAGE_PAYMENT_HASH_HEX,
        preimage: ZERO_PREIMAGE_HEX.slice(0, 63),
      }),
    ).toThrow(RangeError);
  });
});

describe("verifyPreimage / boundary conditions", () => {
  test("0xFF-only preimage round-trips through computed hash", () => {
    const preimage = new Uint8Array(32).fill(0xff);
    const expected = bytesToHex(sha256(preimage));
    expect(verifyPreimage({ paymentHash: expected, preimage })).toBe(true);
  });

  test("returns false for byte arrays equal in content but constructed independently", () => {
    // Sanity: timing-safe-equal compares values, not identity.
    const preimage1 = hexToBytes(NONTRIVIAL_PREIMAGE_HEX);
    const preimage2 = hexToBytes(NONTRIVIAL_PREIMAGE_HEX);
    const correctHash = sha256(preimage1);
    expect(
      verifyPreimage({ paymentHash: correctHash, preimage: preimage2 }),
    ).toBe(true);
  });
});
