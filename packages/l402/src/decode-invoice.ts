import { decode } from "light-bolt11-decoder";

/**
 * Bitcoin-family Lightning networks recognized by BOLT 11 invoice prefixes.
 */
export type Bolt11Network = "mainnet" | "testnet" | "signet" | "regtest";

export interface DecodedInvoice {
  /** 32-byte BOLT 11 `p` tag payment hash. */
  paymentHash: Uint8Array;
  /** Lowercase hex encoding of `paymentHash`. */
  paymentHashHex: string;
  /** Invoice amount in millisatoshis. Amountless invoices return `0n`. */
  amountMsat: bigint;
  /** Absolute invoice expiry time: `timestamp + x`, or the BOLT 11 default expiry. */
  expiresAt: Date;
  /** Inline BOLT 11 `d` tag description, when present. */
  description?: string;
  /** Bitcoin-family network inferred from the invoice HRP. */
  network: Bolt11Network;
}

interface DecoderSection {
  name: string;
  value?: unknown;
  letters?: string;
}

interface DecoderResult {
  sections: DecoderSection[];
}

const PAYMENT_HASH_HEX_LENGTH = 64;
const BOLT11_DEFAULT_EXPIRY_SECONDS = 3600;

/**
 * Decode a BOLT 11 invoice into the L402 fields needed by verifiers and clients.
 *
 * Spec citations:
 * - BOLT 11 `11-payment-encoding.md` §§Human-Readable Part / Tagged Fields:
 *   invoice HRP encodes network + optional amount, `p` is the 256-bit payment
 *   hash, `x` is expiry seconds and defaults to 3600 when absent.
 * - L402 protocol-specification.md §5.1 and §6: challenges carry a BOLT 11
 *   invoice whose payment hash is committed to by the macaroon identifier.
 *
 * The wrapped decoder validates Bech32 structure/checksum and normalizes BOLT 11
 * amount units to millisatoshis. This function narrows the result to stable
 * `@boltwall/l402` public types and keeps amounts as `bigint`.
 */
export function decodeBolt11Invoice(invoice: string): DecodedInvoice {
  const decoded = decode(invoice) as DecoderResult;

  const paymentHashHex = requireStringSection(
    decoded.sections,
    "payment_hash",
    "missing-payment-hash",
  ).toLowerCase();
  if (
    paymentHashHex.length !== PAYMENT_HASH_HEX_LENGTH ||
    !/^[0-9a-f]+$/.test(paymentHashHex)
  ) {
    throw new Error("invalid-payment-hash");
  }

  const timestamp = requireNumberSection(
    decoded.sections,
    "timestamp",
    "missing-timestamp",
  );
  const expiry =
    findNumberSection(decoded.sections, "expiry") ??
    BOLT11_DEFAULT_EXPIRY_SECONDS;

  const description = findStringSection(decoded.sections, "description");
  const result: DecodedInvoice = {
    paymentHash: hexToBytes(paymentHashHex),
    paymentHashHex,
    amountMsat: findAmountMsat(decoded.sections),
    expiresAt: new Date((timestamp + expiry) * 1000),
    network: networkFromSections(decoded.sections),
  };
  if (description !== undefined) {
    result.description = description;
  }
  return result;
}

function findAmountMsat(sections: DecoderSection[]): bigint {
  const amount = findStringSection(sections, "amount");
  return amount === undefined ? 0n : BigInt(amount);
}

function networkFromSections(sections: DecoderSection[]): Bolt11Network {
  const section = sections.find(
    (candidate) => candidate.name === "coin_network",
  );
  switch (section?.letters) {
    case "bc":
      return "mainnet";
    case "tb":
      return "testnet";
    case "tbs":
      return "signet";
    case "bcrt":
      return "regtest";
    default:
      throw new Error("unsupported-network");
  }
}

function requireStringSection(
  sections: DecoderSection[],
  name: string,
  error: string,
): string {
  const value = findStringSection(sections, name);
  if (value === undefined) {
    throw new Error(error);
  }
  return value;
}

function findStringSection(
  sections: DecoderSection[],
  name: string,
): string | undefined {
  const value = sections.find((section) => section.name === name)?.value;
  return typeof value === "string" ? value : undefined;
}

function requireNumberSection(
  sections: DecoderSection[],
  name: string,
  error: string,
): number {
  const value = findNumberSection(sections, name);
  if (value === undefined) {
    throw new Error(error);
  }
  return value;
}

function findNumberSection(
  sections: DecoderSection[],
  name: string,
): number | undefined {
  const value = sections.find((section) => section.name === name)?.value;
  return typeof value === "number" ? value : undefined;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
