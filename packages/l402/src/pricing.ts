const MSATS_PER_SAT = 1_000n;
const MSATS_PER_BTC = 100_000_000_000n;

function assertWholeNumber(value: number, unit: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${unit} amount must be a whole number.`);
  }
}

function assertNonNegative(value: bigint, unit: string): void {
  if (value < 0n) {
    throw new RangeError(`${unit} amount must be non-negative.`);
  }
}

function toWholeBigInt(value: number | bigint, unit: string): bigint {
  if (typeof value === "number") {
    assertWholeNumber(value, unit);
    return BigInt(value);
  }

  return value;
}

function btcNumberToMsats(value: number): bigint {
  if (!Number.isFinite(value)) {
    throw new RangeError("btc amount must be finite.");
  }
  if (value < 0) {
    throw new RangeError("btc amount must be non-negative.");
  }
  if (Number.isInteger(value)) {
    return BigInt(value) * MSATS_PER_BTC;
  }

  const amountMsat = Math.round(value * Number(MSATS_PER_BTC));

  if (
    !Number.isSafeInteger(amountMsat) ||
    amountMsat / Number(MSATS_PER_BTC) !== value
  ) {
    throw new RangeError(
      "btc amount must resolve to a safe whole millisatoshi amount.",
    );
  }

  return BigInt(amountMsat);
}

/**
 * Convert a whole-satoshi public price into canonical bigint millisatoshis.
 *
 * L402 protocol-specification.md §6.1 describes server prices as
 * millisatoshis. This helper keeps call sites readable while rejecting
 * fractional or negative satoshi inputs at the public API boundary.
 *
 * @example
 * ```ts
 * const priceMsat = sats(25);
 * ```
 */
export function sats(n: number | bigint): bigint {
  const amount = toWholeBigInt(n, "sats");
  assertNonNegative(amount, "sats");
  return amount * MSATS_PER_SAT;
}

/**
 * Mark an already-canonical millisatoshi amount as an L402 price.
 *
 * This is a typecheck pass-through. It exists so configuration reads as
 * `price: msats(1500n)` instead of a bare bigint literal.
 *
 * @example
 * ```ts
 * const priceMsat = msats(1500n);
 * ```
 */
export function msats(n: bigint): bigint {
  assertNonNegative(n, "msats");
  return n;
}

/**
 * Convert a BTC public price into canonical bigint millisatoshis.
 *
 * L402 prices are represented internally as millisatoshis per
 * protocol-specification.md §6.1. Number inputs may be fractional only when
 * they resolve to a safe whole millisatoshi amount. Decimal BTC strings belong
 * at an input parsing boundary rather than in protocol configuration.
 *
 * @example
 * ```ts
 * const priceMsat = btc(1n);
 * ```
 */
export function btc(n: number | bigint): bigint {
  if (typeof n === "number") {
    return btcNumberToMsats(n);
  }

  const amount = toWholeBigInt(n, "btc");
  assertNonNegative(amount, "btc");
  return amount * MSATS_PER_BTC;
}
