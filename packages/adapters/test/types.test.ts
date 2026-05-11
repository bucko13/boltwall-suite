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
          paymentHash: "0000000000000000000000000000000000000000000000000000000000000000",
          amountMsat: 1_000n,
          preimage: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
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

  test("accepts OpenNode-like non-HODL capability surfaces", async () => {
    const backend = {
      kind: "opennode",
      capabilities: {
        hodl: false,
        cancelInvoice: false,
        streamingInvoices: false,
        customDescription: true,
      },
      async createInvoice(request) {
        return {
          paymentRequest: "lnbc1opennodestub",
          paymentHash: "1111111111111111111111111111111111111111111111111111111111111111",
          amountMsat: request.amountMsat,
        };
      },
      async lookupInvoice(paymentHash) {
        return {
          status: "settled",
          paymentHash,
          amountMsat: 2_000n,
        };
      },
    } satisfies LightningBackend;

    const invoice = await backend.createInvoice({ amountMsat: 2_000n });
    const lookup = await backend.lookupInvoice(invoice.paymentHash);

    expect(backend.capabilities.hodl).toBe(false);
    expect(backend.capabilities.cancelInvoice).toBe(false);
    expect(backend.capabilities.streamingInvoices).toBe(false);
    expect(backend.capabilities.customDescription).toBe(true);
    expect(lookup.preimage).toBeUndefined();
  });

  test("accepts BTCPay-like polling capability surfaces", async () => {
    const backend = {
      kind: "btcpay",
      capabilities: {
        hodl: false,
        cancelInvoice: false,
        streamingInvoices: false,
        customDescription: true,
      },
      async createInvoice(request) {
        return {
          paymentRequest: "lnbc1btcpaystub",
          paymentHash: "2222222222222222222222222222222222222222222222222222222222222222",
          amountMsat: request.amountMsat,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        };
      },
      async lookupInvoice(paymentHash) {
        return {
          status: "open",
          paymentHash,
          amountMsat: 3_000n,
        };
      },
    } satisfies LightningBackend;

    const invoice = await backend.createInvoice({
      amountMsat: 3_000n,
      description: "btcpay stub",
    });
    const lookup = await backend.lookupInvoice(invoice.paymentHash);

    expect(backend.capabilities.hodl).toBe(false);
    expect(backend.capabilities.cancelInvoice).toBe(false);
    expect(backend.capabilities.streamingInvoices).toBe(false);
    expect(invoice.expiresAt).toEqual(new Date("2030-01-01T00:00:00.000Z"));
    expect(lookup.status).toBe("open");
  });
});
