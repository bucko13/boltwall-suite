/**
 * Skipped-by-default integration test for the Voltage LND adapter profile.
 *
 * Runs only when `VOLTAGE_TEST_LND_BASE_URL`, `VOLTAGE_TEST_LND_MACAROON`,
 * and `VOLTAGE_TEST_LND_CERT` are all set. Without them, the entire
 * `describe` block is skipped — matching the AGENTS.md testing contract
 * for infrastructure-dependent tests.
 *
 * Required env vars (Voltage Cloud dashboard credentials):
 * - `VOLTAGE_TEST_LND_BASE_URL` — node base URL or host (bare host,
 *   `host:port`, or full `https://` URL). The factory normalizes to the
 *   gRPC `host:10009` socket per <https://docs.voltage.cloud/lnd-node-api>.
 * - `VOLTAGE_TEST_LND_MACAROON` — admin macaroon as a lowercase hex string
 *   from the dashboard's "Admin Macaroon" tile.
 * - `VOLTAGE_TEST_LND_CERT` — TLS certificate (base64 or PEM) from the
 *   dashboard.
 *
 * Test deployment policy: this test creates a real invoice on the Voltage
 * node and does not pay it. Run against a testnet or owner-provided
 * staging node; never against a production mainnet node without owner
 * sign-off. The test does not spend any sats.
 */

import { describe, expect, test } from "bun:test";

import { createVoltageLndAdapterFromEnv } from "../../src/voltage-lnd";

const baseUrl = process.env.VOLTAGE_TEST_LND_BASE_URL;
const macaroon = process.env.VOLTAGE_TEST_LND_MACAROON;
const cert = process.env.VOLTAGE_TEST_LND_CERT;
const skip =
  baseUrl === undefined ||
  baseUrl === "" ||
  macaroon === undefined ||
  macaroon === "" ||
  cert === undefined ||
  cert === "";

describe.skipIf(skip)("Voltage LND adapter — live integration", () => {
  test("creates an invoice and looks it up by payment hash", async () => {
    const env: Record<string, string> = {
      VOLTAGE_LND_BASE_URL: baseUrl ?? "",
      VOLTAGE_LND_MACAROON: macaroon ?? "",
      VOLTAGE_LND_CERT: cert ?? "",
    };

    const adapter = createVoltageLndAdapterFromEnv(env);
    expect(adapter.kind).toBe("lnd");
    // Voltage exposes the full LND surface, so capability flags inherit
    // LndAdapter defaults unchanged (HODL + cancel + streaming + custom
    // description).
    expect(adapter.capabilities.hodl).toBe(true);

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
