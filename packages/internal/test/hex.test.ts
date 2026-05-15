import { describe, expect, test } from "bun:test";

import { bytesToHex, hexToBytes, hexToBytes32 } from "../src/hex";

describe("bytesToHex", () => {
  test("encodes an empty array as an empty string", () => {
    expect(bytesToHex(new Uint8Array())).toBe("");
  });

  test("encodes single bytes with zero-padding", () => {
    expect(bytesToHex(new Uint8Array([0x00]))).toBe("00");
    expect(bytesToHex(new Uint8Array([0x0a]))).toBe("0a");
    expect(bytesToHex(new Uint8Array([0xff]))).toBe("ff");
  });

  test("encodes a multi-byte sequence in order", () => {
    expect(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("deadbeef");
  });

  test("emits lowercase hex", () => {
    expect(bytesToHex(new Uint8Array([0xab, 0xcd, 0xef]))).toBe("abcdef");
  });
});

describe("hexToBytes", () => {
  test("round-trips bytesToHex output", () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 0xff, 0xfe]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  test("decodes an empty string to an empty array", () => {
    expect(hexToBytes("")).toEqual(new Uint8Array());
  });

  test("accepts uppercase hex", () => {
    expect(hexToBytes("DEADBEEF")).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  test("rejects odd-length input", () => {
    expect(() => hexToBytes("abc")).toThrow(RangeError);
  });

  test("rejects non-hex characters", () => {
    expect(() => hexToBytes("zz")).toThrow(RangeError);
    expect(() => hexToBytes("ab cd")).toThrow(RangeError);
  });
});

describe("hexToBytes32", () => {
  const HEX_32 = "11".repeat(32);

  test("decodes a 64-char hex string to a 32-byte array", () => {
    const bytes = hexToBytes32(HEX_32);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(0x11);
  });

  test("rejects strings shorter than 64 chars", () => {
    expect(() => hexToBytes32("11".repeat(31))).toThrow(RangeError);
  });

  test("rejects strings longer than 64 chars", () => {
    expect(() => hexToBytes32("11".repeat(33))).toThrow(RangeError);
  });

  test("rejects non-hex characters", () => {
    expect(() => hexToBytes32("z".repeat(64))).toThrow(RangeError);
  });

  test("embeds the label in size error messages", () => {
    try {
      hexToBytes32("11", "preimage");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as Error).message).toContain("preimage");
    }
  });

  test("embeds the label in hex error messages", () => {
    try {
      hexToBytes32("z".repeat(64), "paymentHash");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as Error).message).toContain("paymentHash");
    }
  });

  test("defaults the label to 'value' when omitted", () => {
    try {
      hexToBytes32("11");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as Error).message).toContain("value");
    }
  });
});
