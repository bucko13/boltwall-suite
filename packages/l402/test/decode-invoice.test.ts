import { describe, expect, it } from "bun:test";
import { BOLT11_SPEC_EXAMPLES } from "@boltwall/test-fixtures";

import { decodeBolt11Invoice } from "../src/decode-invoice";

const BASE_DENOMINATION_INVOICE = BOLT11_SPEC_EXAMPLES.find(
  (fixture) => fixture.name === "bolt11-spec-microbtc-mainnet",
);

if (BASE_DENOMINATION_INVOICE === undefined) {
  throw new Error("missing-base-denomination-fixture");
}

describe("decodeBolt11Invoice", () => {
  it.each(BOLT11_SPEC_EXAMPLES)(
    "decodes $name",
    ({ invoice, paymentHashHex, amountMsat, expiresAtIso, description, network }) => {
      const decoded = decodeBolt11Invoice(invoice);

      expect(decoded.paymentHashHex).toBe(paymentHashHex);
      expect(bytesToHex(decoded.paymentHash)).toBe(paymentHashHex);
      expect(decoded.amountMsat).toBe(amountMsat);
      expect(typeof decoded.amountMsat).toBe("bigint");
      expect(decoded.expiresAt.toISOString()).toBe(expiresAtIso);
      expect(decoded.description).toBe(description);
      expect(decoded.network).toBe(network);
    },
  );

  it.each([
    ["pico-btc", "2500000p", 250_000n],
    ["nano-btc", "250n", 25_000n],
    ["micro-btc", "2500u", 250_000_000n],
    ["milli-btc", "20m", 2_000_000_000n],
  ])("decodes %s amount denomination as bigint msat", (_name, amount, expected) => {
    const decoded = decodeBolt11Invoice(
      rewriteInvoiceHrp(BASE_DENOMINATION_INVOICE.invoice, `lnbc${amount}`),
    );

    expect(decoded.amountMsat).toBe(expected);
    expect(typeof decoded.amountMsat).toBe("bigint");
  });

  it.each([
    ["testnet", "lntb2500u", "testnet"],
    ["signet", "lntbs2500u", "signet"],
    ["regtest", "lnbcrt2500u", "regtest"],
  ] as const)("detects %s invoices", (_name, hrp, network) => {
    const decoded = decodeBolt11Invoice(
      rewriteInvoiceHrp(BASE_DENOMINATION_INVOICE.invoice, hrp),
    );

    expect(decoded.network).toBe(network);
  });

  it("rejects invalid bech32 invoices", () => {
    expect(() =>
      decodeBolt11Invoice(`${BASE_DENOMINATION_INVOICE.invoice.slice(0, -1)}x`),
    ).toThrow();
  });

  it("rejects invoices without a payment hash", () => {
    const withoutPaymentHash = removeFirstTaggedField(
      BASE_DENOMINATION_INVOICE.invoice,
      1,
    );

    expect(() => decodeBolt11Invoice(withoutPaymentHash)).toThrow(
      "missing-payment-hash",
    );
  });
});

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function rewriteInvoiceHrp(invoice: string, hrp: string): string {
  const decoded = decodeBech32(invoice);
  return encodeBech32(hrp, decoded.words);
}

function removeFirstTaggedField(invoice: string, tag: number): string {
  const decoded = decodeBech32(invoice);
  const data = decoded.words.slice(0, -104);
  const signature = decoded.words.slice(-104);
  const output = data.slice(0, 7);

  let offset = 7;
  let removed = false;
  while (offset < data.length) {
    const fieldTag = data[offset];
    const length = data[offset + 1] * 32 + data[offset + 2];
    const end = offset + 3 + length;
    if (!removed && fieldTag === tag) {
      removed = true;
    } else {
      output.push(...data.slice(offset, end));
    }
    offset = end;
  }

  if (!removed) {
    throw new Error("tag-not-found");
  }

  output.push(...signature);
  return encodeBech32(decoded.hrp, output);
}

function decodeBech32(input: string): { hrp: string; words: number[] } {
  const normalized = input.toLowerCase();
  const separator = normalized.lastIndexOf("1");
  if (separator < 1) {
    throw new Error("invalid-bech32");
  }
  const hrp = normalized.slice(0, separator);
  const data = normalized
    .slice(separator + 1, -6)
    .split("")
    .map((char) => {
      const value = CHARSET.indexOf(char);
      if (value === -1) {
        throw new Error("invalid-bech32-char");
      }
      return value;
    });
  return { hrp, words: data };
}

function encodeBech32(hrp: string, words: number[]): string {
  const checksum = createChecksum(hrp, words);
  const encodedWords = [...words, ...checksum]
    .map((word) => CHARSET[word])
    .join("");
  return `${hrp}${"1"}${encodedWords}`;
}

function createChecksum(hrp: string, words: number[]): number[] {
  const values = [...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) {
    checksum.push((mod >> (5 * (5 - i))) & 31);
  }
  return checksum;
}

function hrpExpand(hrp: string): number[] {
  const high = Array.from(hrp, (char) => char.charCodeAt(0) >> 5);
  const low = Array.from(hrp, (char) => char.charCodeAt(0) & 31);
  return [...high, 0, ...low];
}

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < GENERATOR.length; i++) {
      if (((top >> i) & 1) === 1) {
        chk ^= GENERATOR[i];
      }
    }
  }
  return chk;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
