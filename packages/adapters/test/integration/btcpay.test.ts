/**
 * Skipped-by-default integration test for the BTCPay Server adapter.
 *
 * Runs only when every required `BTCPAY_TEST_*` env var is set. Without
 * them, the entire `describe` block is skipped — matching the AGENTS.md
 * testing contract for infrastructure-dependent tests.
 *
 * Required env vars:
 * - `BTCPAY_TEST_BASE_URL` — BTCPay Server Greenfield API base URL.
 * - `BTCPAY_TEST_API_KEY` — Greenfield API key with `btcpay.store.cancreateinvoice`
 *   and `btcpay.store.canviewinvoices` permissions on the test store.
 * - `BTCPAY_TEST_STORE_ID` — store id under that BTCPay account.
 * - `BTCPAY_TEST_CRYPTO_CODE` — optional, defaults to `BTC`. Use `TBTC` for
 *   testnet stores when the deployment exposes it under that code.
 *
 * Test deployment policy: tests should run against a BTCPay testnet store
 * or an owner-provided staging deployment, never a production store with
 * real mainnet sats. The default `crypto code` of `BTC` is intentionally
 * neutral; the test does not pay the invoice it creates.
 */

import { describe, expect, test } from "bun:test";

import { createBtcPayAdapterFromEnv } from "../../src/btcpay";

const baseUrl = process.env.BTCPAY_TEST_BASE_URL;
const apiKey = process.env.BTCPAY_TEST_API_KEY;
const storeId = process.env.BTCPAY_TEST_STORE_ID;
const cryptoCode = process.env.BTCPAY_TEST_CRYPTO_CODE;
const skip =
  baseUrl === undefined ||
  baseUrl === "" ||
  apiKey === undefined ||
  apiKey === "" ||
  storeId === undefined ||
  storeId === "";

describe.skipIf(skip)("BTCPay adapter — live integration", () => {
  test("creates an invoice and looks it up by payment hash", async () => {
    const env: Record<string, string> = {
      BTCPAY_BASE_URL: baseUrl ?? "",
      BTCPAY_API_KEY: apiKey ?? "",
      BTCPAY_STORE_ID: storeId ?? "",
    };
    if (cryptoCode !== undefined && cryptoCode !== "") {
      env.BTCPAY_CRYPTO_CODE = cryptoCode;
    }

    const adapter = createBtcPayAdapterFromEnv(env);
    expect(adapter.kind).toBe("btcpay");
    // Default BTCPay capabilities — adapter defaults `hodl` and
    // `streamingInvoices` off unless explicitly enabled via env flags.
    expect(adapter.capabilities.hodl).toBe(false);

    const invoice = await adapter.createInvoice({
      amountMsat: 1_000n,
      description: "boltwall integration test",
    });

    expect(invoice.paymentRequest).toMatch(/^lnbc/);
    expect(invoice.paymentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(invoice.amountMsat).toBe(1_000n);

    const lookup = await adapter.lookupInvoice(invoice.paymentHash);
    expect(lookup.paymentHash).toBe(invoice.paymentHash);
    expect(["open", "settled", "canceled", "expired"]).toContain(lookup.status);
  });
});
