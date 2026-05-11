import { describe, expect, test } from "bun:test";

import type { LightningBackend } from "../src";

describe("LightningBackend type contract", () => {
  test("accepts a stub backend with capability flags and bigint millisatoshi amounts", async () => {
    const backend = {
      kind: "mock",
      capabilities: {
        hodl: true,
        cancelInvoice: true,
        streamingInvoices: true,
        customDescription: true,
      },
      async createInvoice(request) {
        return {
          paymentRequest: "lnbc1stub",
          paymentHash:
            request.paymentHash ??
            "0000000000000000000000000000000000000000000000000000000000000000",
          amountMsat: request.amountMsat,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
      async lookupInvoice(paymentHash) {
        return {
          status: "open",
          paymentHash,
          amountMsat: 1_000n,
        };
      },
      async cancelInvoice() {},
      async settleHodlInvoice() {},
      async *subscribeInvoices() {
        yield {
          status: "settled",
          paymentHash:
            "0000000000000000000000000000000000000000000000000000000000000000",
          amountMsat: 1_000n,
          preimage:
            "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        };
      },
    } satisfies LightningBackend;

    const invoice = await backend.createInvoice({ amountMsat: 1_000n });
    const lookup = await backend.lookupInvoice(invoice.paymentHash);
    const updates = backend.subscribeInvoices();
    const firstUpdate = await updates.next();

    expect(backend.capabilities.hodl).toBe(true);
    expect(invoice.amountMsat).toBe(1_000n);
    expect(lookup.status).toBe("open");
    expect(firstUpdate.value?.status).toBe("settled");
  });
});
