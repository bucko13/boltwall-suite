const MSATS_PER_SAT = 1_000n;
const MSATS_PER_BTC = 100_000_000_000n;
const MAX_BTC_FRACTION_DIGITS = 11;
const MAX_SAT_FRACTION_DIGITS = 3;

type AmountUnit = "sats" | "msats" | "btc";

const NON_NEGATIVE_ERROR = "Amount must be non-negative.";

function assertNonNegative(value: bigint): void {
  if (value < 0n) {
    throw new RangeError(NON_NEGATIVE_ERROR);
  }
}

function normalizeUnit(unit: string): AmountUnit {
  switch (unit.toLowerCase()) {
    case "sat":
    case "sats":
      return "sats";
    case "msat":
    case "msats":
      return "msats";
    case "btc":
      return "btc";
    default:
      throw new RangeError(`Unsupported amount unit: ${unit}`);
  }
}

function parseFractionToMsats(fraction: string, digits: number): bigint {
  const trimmed = fraction.replace(/0+$/, "");

  if (trimmed.length > digits) {
    throw new RangeError("Amount is below 1 msat precision.");
  }

  if (trimmed.length === 0) {
    return 0n;
  }

  return BigInt(trimmed.padEnd(digits, "0"));
}

/**
 * Convert whole satoshis to millisatoshis.
 */
export function satsToMsats(value: bigint): bigint {
  assertNonNegative(value);
  return value * MSATS_PER_SAT;
}

/**
 * Split a millisatoshi amount into whole satoshis plus the leftover msat remainder.
 */
export function msatsToSats(
  value: bigint,
): { sats: bigint; msatRemainder: bigint } {
  assertNonNegative(value);

  return {
    sats: value / MSATS_PER_SAT,
    msatRemainder: value % MSATS_PER_SAT,
  };
}

/**
 * Parse a user-facing amount string into canonical bigint millisatoshis.
 */
export function parseAmount(
  input: string,
  defaultUnit: AmountUnit = "sats",
): bigint {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    throw new RangeError("Amount cannot be empty.");
  }

  if (/[,+-]|e/i.test(trimmed)) {
    throw new RangeError("Amount must be a plain non-negative decimal string.");
  }

  const match = /^(\d+)(?:\.(\d+))?(?:\s*([A-Za-z]+))?$/.exec(trimmed);

  if (!match) {
    throw new RangeError("Invalid amount format.");
  }

  const wholePart = match[1];
  const fractionPart = match[2] ?? "";
  const unitPart = match[3];

  if (!wholePart) {
    throw new RangeError("Invalid amount format.");
  }

  const unit = unitPart ? normalizeUnit(unitPart) : defaultUnit;
  const whole = BigInt(wholePart);

  switch (unit) {
    case "msats":
      if (fractionPart.replace(/0+$/, "").length > 0) {
        throw new RangeError("Amount is below 1 msat precision.");
      }
      return whole;
    case "sats":
      return whole * MSATS_PER_SAT + parseFractionToMsats(fractionPart, MAX_SAT_FRACTION_DIGITS);
    case "btc":
      return whole * MSATS_PER_BTC + parseFractionToMsats(fractionPart, MAX_BTC_FRACTION_DIGITS);
  }
}

/**
 * Format millisatoshis as a sats string with up to 3 decimal places.
 */
export function formatSats(value: bigint): string {
  assertNonNegative(value);

  const { sats, msatRemainder } = msatsToSats(value);

  if (msatRemainder === 0n) {
    return sats.toString();
  }

  return `${sats}.${msatRemainder
    .toString()
    .padStart(MAX_SAT_FRACTION_DIGITS, "0")
    .replace(/0+$/, "")}`;
}

/**
 * Format millisatoshis as a BTC string with up to 11 decimal places.
 */
export function formatBtc(value: bigint): string {
  assertNonNegative(value);

  const whole = value / MSATS_PER_BTC;
  const remainder = value % MSATS_PER_BTC;

  if (remainder === 0n) {
    return whole.toString();
  }

  return `${whole}.${remainder
    .toString()
    .padStart(MAX_BTC_FRACTION_DIGITS, "0")
    .replace(/0+$/, "")}`;
}
