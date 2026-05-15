/**
 * Skipped-by-default integration test for the OpenNode adapter.
 *
 * Runs only when `OPENNODE_TEST_API_KEY` is set in the environment. Without
 * it, the entire `describe` block is skipped and the test surface stays
 * silent — matching the AGENTS.md testing contract for infrastructure-
 * dependent tests.
 *
 * Required env vars:
 * - `OPENNODE_TEST_API_KEY` — OpenNode API key for a *development*
 *   environment account. **Do not** point this at a production key.
 * - `OPENNODE_TEST_BASE_URL` — optional. Defaults to OpenNode's standard
 *   API base. Set to `https://dev-api.opennode.com` when running against
 *   the OpenNode developer-environment endpoint.
 *
 * Test deployment policy: this test creates a real charge on OpenNode and
 * does not settle it. Use a development-environment key only; OpenNode's
 * production endpoint is not configured for automated test charges.
 */

import { describe, expect, test } from "bun:test";

import { createOpenNodeAdapterFromEnv } from "../../src/opennode";

const apiKey = process.env.OPENNODE_TEST_API_KEY;
const baseUrl = process.env.OPENNODE_TEST_BASE_URL;
const skip = apiKey === undefined || apiKey === "";

describe.skipIf(skip)("OpenNode adapter — live integration", () => {
  test("creates an invoice and looks it up by payment hash", async () => {
    const env: Record<string, string> = { OPENNODE_API_KEY: apiKey ?? "" };
    if (baseUrl !== undefined && baseUrl !== "") {
      env.OPENNODE_BASE_URL = baseUrl;
    }

    const adapter = createOpenNodeAdapterFromEnv(env);
    expect(adapter.kind).toBe("opennode");
    // Capability flags assert what the adapter *advertises*, not what the
    // provider supports end-to-end. Provider-specific capability gaps
    // (e.g. HODL on OpenNode) are documented in the adapter README.
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
