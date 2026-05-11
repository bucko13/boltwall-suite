import { describe, expect, test } from "bun:test";

import { MockAdapter } from "../src/testing";

const PAYMENT_HASH =
  "1111111111111111111111111111111111111111111111111111111111111111";
const ZERO_PREIMAGE =
  "0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_PREIMAGE_HASH =
  "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925";

describe("MockAdapter", () => {
  test("creates and looks up an open invoice with full capability flags", async () => {
    const adapter = new MockAdapter();

    const created = await adapter.createInvoice({
      amountMsat: 1_500n,
      description: "pokedex",
      metadata: { route: "/pokemon/25" },
    });
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(adapter.kind).toBe("mock");
    expect(adapter.capabilities).toEqual({
      hodl: true,
      cancelInvoice: true,
      streamingInvoices: true,
      customDescription: true,
    });
    expect(created.paymentRequest).toContain(created.paymentHash);
    expect(created.amountMsat).toBe(1_500n);
    expect(lookup.status).toBe("open");
    expect(lookup.amountMsat).toBe(1_500n);
  });

  test("settle marks an invoice settled and stores a preimage", async () => {
    const adapter = new MockAdapter();
    const created = await adapter.createInvoice({ amountMsat: 2_000n });

    adapter.settle(created.paymentHash, ZERO_PREIMAGE);
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(lookup.status).toBe("settled");
    expect(lookup.preimage).toBe(ZERO_PREIMAGE);
  });

  test("expire and cancel transition invoice state", async () => {
    const adapter = new MockAdapter();
    const expired = await adapter.createInvoice({ amountMsat: 3_000n });
    const canceled = await adapter.createInvoice({ amountMsat: 4_000n });

    adapter.expire(expired.paymentHash);
    await adapter.cancelInvoice(canceled.paymentHash);

    expect((await adapter.lookupInvoice(expired.paymentHash)).status).toBe("expired");
    expect((await adapter.lookupInvoice(canceled.paymentHash)).status).toBe(
      "canceled",
    );
  });

  test("settleHodlInvoice settles the matching payment hash", async () => {
    const adapter = new MockAdapter();
    const created = await adapter.createInvoice({
      amountMsat: 5_000n,
      hodl: true,
      paymentHash: ZERO_PREIMAGE_HASH,
    });

    await adapter.settleHodlInvoice(ZERO_PREIMAGE);
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(lookup.status).toBe("settled");
    expect(lookup.preimage).toBe(ZERO_PREIMAGE);
  });

  test("settleHodlInvoice rejects mismatched preimages", async () => {
    const adapter = new MockAdapter();
    await adapter.createInvoice({
      amountMsat: 6_000n,
      hodl: true,
      paymentHash: PAYMENT_HASH,
    });

    await expect(adapter.settleHodlInvoice(ZERO_PREIMAGE)).rejects.toThrow(
      "mock-hodl-preimage-mismatch",
    );
  });

  test("subscribeInvoices emits open and settled updates", async () => {
    const adapter = new MockAdapter();
    const updates = adapter.subscribeInvoices()[Symbol.asyncIterator]();

    const openPromise = updates.next();
    const created = await adapter.createInvoice({ amountMsat: 7_000n });
    const open = await openPromise;

    const settledPromise = updates.next();
    adapter.settle(created.paymentHash, ZERO_PREIMAGE);
    const settled = await settledPromise;
    await updates.return?.();

    expect(open.value.status).toBe("open");
    expect(settled.value.status).toBe("settled");
    expect(settled.value.preimage).toBe(ZERO_PREIMAGE);
  });
});
