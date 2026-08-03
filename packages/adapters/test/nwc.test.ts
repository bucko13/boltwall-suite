import { describe, expect, test } from "bun:test";

import {
  NwcAdapter,
  NwcAdapterError,
  NwcEnvError,
  createNwcAdapterFromEnv,
  loadNwcEnv,
  nwcEnvVariables,
  nwcProviderMetadata,
  type NwcClientLike,
  type NwcTransaction,
} from "../src/nwc";

const PAYMENT_HASH = "0001020304050607080900010203040506070809000102030405060708090102";
const PAYREQ =
  "lnbc2500u1pvjluezsp5zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zyg3zygspp5qqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqqqsyqcyq5rqwzqfqypqdq5xysxxatsyp3k7enxv4jsxqzpu9qrsgquk0rl77nj30yxdy8j9vdx85fkpmdla2087ne0xh8nhedh8w27kyke0lp53ut353s06fv3qfegext0eh0ymjpf39tuven09sam30g4vgpfna3rh";
const TEST_NWC_PUBKEY = "test-wallet-pubkey";
const TEST_NWC_SECRET = "not-a-real-nwc-test-secret";
const VALID_NWC_URL = `nostr+walletconnect://${TEST_NWC_PUBKEY}?relay=wss%3A%2F%2Frelay.example.test%2Fv1&secret=${TEST_NWC_SECRET}`;

describe("NwcAdapter", () => {
  test("creates and looks up standard invoices through an injected NWC client", async () => {
    const calls: NwcCall[] = [];
    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () =>
        nwcClientStub(calls, {
          makeInvoice: {
            invoice: PAYREQ,
            payment_hash: PAYMENT_HASH,
            amount: 250_000_000,
            state: "pending",
            expires_at: 1_900_000_000,
          },
          lookupInvoice: {
            invoice: PAYREQ,
            payment_hash: PAYMENT_HASH,
            amount: 250_000_000,
            state: "settled",
            settled_at: 1_800_000_000,
            preimage: "22".repeat(32),
          },
        }),
    });

    const created = await adapter.createInvoice({
      amountMsat: 250_000_000n,
      description: "pokedex",
      expirySeconds: 180,
      metadata: { orderId: "order-123" },
    });
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(created).toEqual({
      paymentRequest: PAYREQ,
      paymentHash: PAYMENT_HASH,
      amountMsat: 250_000_000n,
      expiresAt: new Date("2030-03-17T17:46:40.000Z"),
    });
    expect(lookup).toEqual({
      status: "settled",
      paymentHash: PAYMENT_HASH,
      amountMsat: 250_000_000n,
      settledAt: new Date("2027-01-15T08:00:00.000Z"),
      preimage: "22".repeat(32),
    });
    expect(calls).toEqual([
      {
        method: "makeInvoice",
        request: {
          amount: 250_000_000,
          description: "pokedex",
          expiry: 180,
          metadata: { orderId: "order-123" },
        },
      },
      { method: "lookupInvoice", request: { payment_hash: PAYMENT_HASH } },
    ]);
  });

  test("rejects unsupported HODL and feature assertions", async () => {
    expect(
      () =>
        new NwcAdapter({
          nostrWalletConnectUrl: VALID_NWC_URL,
          features: { hodlInvoices: true },
        }),
    ).toThrow(NwcAdapterError);

    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () =>
        nwcClientStub([], {
          makeInvoice: { invoice: PAYREQ, payment_hash: PAYMENT_HASH, amount: 250_000_000 },
        }),
    });

    await expect(
      adapter.createInvoice({ amountMsat: 250_000_000n, hodl: true }),
    ).rejects.toMatchObject({
      kind: "unsupported-feature",
    });
  });

  test("maps NWC states conservatively", async () => {
    const statuses = [
      ["pending", "open"],
      ["settled", "settled"],
      ["failed", "canceled"],
      ["accepted", "held"],
      [undefined, "open"],
    ] as const;
    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () =>
        nwcClientStub([], {
          makeInvoice: { invoice: PAYREQ, payment_hash: PAYMENT_HASH, amount: 250_000_000 },
          lookupInvoices: statuses.map(([state]) => ({
            invoice: PAYREQ,
            payment_hash: PAYMENT_HASH,
            amount: 250_000_000,
            ...(state === undefined ? {} : { state }),
          })),
        }),
    });

    for (const [, expected] of statuses) {
      await expect(adapter.lookupInvoice(PAYMENT_HASH)).resolves.toMatchObject({
        status: expected,
      });
    }
  });

  test("rejects malformed wallet responses", async () => {
    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () =>
        nwcClientStub([], {
          makeInvoice: { invoice: PAYREQ, payment_hash: "11".repeat(32), amount: 250_000_000 },
        }),
    });

    await expect(adapter.createInvoice({ amountMsat: 250_000_000n })).rejects.toMatchObject({
      kind: "invalid-response",
      message: "NWC invoice payment hash does not match BOLT 11 invoice",
    });
  });

  test("redacts NWC connection secrets from wrapped SDK failures", async () => {
    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () => ({
        async makeInvoice() {
          throw new Error(`failed with ${VALID_NWC_URL}`);
        },
        async lookupInvoice() {
          throw new Error("unexpected");
        },
      }),
    });

    try {
      await adapter.createInvoice({ amountMsat: 250_000_000n });
      throw new Error("expected-create-invoice-failure");
    } catch (error) {
      expect(error).toBeInstanceOf(NwcAdapterError);
      const causeMessage =
        error instanceof NwcAdapterError && error.cause instanceof Error ? error.cause.message : "";
      expect(causeMessage).toContain("[redacted-nwc-connection-string]");
      expect(causeMessage).not.toContain("nostr+walletconnect://");
      expect(causeMessage).not.toContain(TEST_NWC_SECRET);
    }
  });

  test("redacts object-shaped SDK failures", async () => {
    const adapter = new NwcAdapter({
      nostrWalletConnectUrl: VALID_NWC_URL,
      clientFactory: () => ({
        async makeInvoice() {
          throw { code: "relay_error", message: `secret leaked: ${VALID_NWC_URL}` };
        },
        async lookupInvoice() {
          throw new Error("unexpected");
        },
      }),
    });

    try {
      await adapter.createInvoice({ amountMsat: 250_000_000n });
      throw new Error("expected-create-invoice-failure");
    } catch (error) {
      expect(error).toBeInstanceOf(NwcAdapterError);
      const causeMessage =
        error instanceof NwcAdapterError &&
        typeof error.cause === "object" &&
        error.cause !== null &&
        "message" in error.cause
          ? String(error.cause.message)
          : "";
      expect(causeMessage).toContain("[redacted-nwc-connection-string]");
      expect(causeMessage).not.toContain("nostr+walletconnect://");
      expect(causeMessage).not.toContain(TEST_NWC_SECRET);
    }
  });

  test("loads env without leaking the connection string", () => {
    expect(nwcEnvVariables).toEqual([
      expect.objectContaining({
        name: "NWC_CONNECTION_STRING",
        required: true,
        mapsTo: "nostrWalletConnectUrl",
        secret: true,
      }),
    ]);
    expect(loadNwcEnv({ NWC_CONNECTION_STRING: ` ${VALID_NWC_URL} ` })).toEqual({
      nostrWalletConnectUrl: VALID_NWC_URL,
    });
    expect(() => loadNwcEnv({})).toThrow(NwcEnvError);
    expect(() => loadNwcEnv({ NWC_CONNECTION_STRING: "https://example.com" })).toThrow(
      /value redacted/u,
    );
    expect(() =>
      loadNwcEnv({
        NWC_CONNECTION_STRING: `nostr+walletconnect://${TEST_NWC_PUBKEY}?relay=wss%3A%2F%2Frelay.example.test%2Fv1`,
      }),
    ).toThrow(/value redacted/u);
  });

  test("validates direct adapter connection strings without leaking values", () => {
    try {
      new NwcAdapter({
        nostrWalletConnectUrl: `nostr+walletconnect://${TEST_NWC_PUBKEY}?relay=wss%3A%2F%2Frelay.example.test%2Fv1`,
      });
      throw new Error("expected-constructor-failure");
    } catch (error) {
      expect(error).toBeInstanceOf(NwcAdapterError);
      expect(error).toMatchObject({ kind: "invalid-request" });
      expect(String(error)).not.toContain("nostr+walletconnect://");
    }
  });

  test("creates adapter from env and exposes conservative metadata", () => {
    const adapter = createNwcAdapterFromEnv(
      { NWC_CONNECTION_STRING: VALID_NWC_URL },
      {
        clientFactory: () =>
          nwcClientStub([], {
            makeInvoice: { invoice: PAYREQ, payment_hash: PAYMENT_HASH, amount: 250_000_000 },
          }),
      },
    );

    expect(adapter.kind).toBe("nwc");
    expect(adapter.capabilities).toEqual({
      hodl: false,
      cancelInvoice: false,
      streamingInvoices: false,
      customDescription: true,
    });
    expect(nwcProviderMetadata.provider).toBe("nwc");
    expect(
      nwcProviderMetadata.features.find((feature) => feature.name === "customDescription"),
    ).toMatchObject({ support: "supported" });
  });
});

type NwcCall =
  | { method: "makeInvoice"; request: Parameters<NwcClientLike["makeInvoice"]>[0] }
  | { method: "lookupInvoice"; request: Parameters<NwcClientLike["lookupInvoice"]>[0] };

interface NwcStubResponses {
  makeInvoice: NwcTransaction;
  lookupInvoice?: NwcTransaction;
  lookupInvoices?: NwcTransaction[];
}

function nwcClientStub(calls: NwcCall[], responses: NwcStubResponses): NwcClientLike {
  const lookups = [...(responses.lookupInvoices ?? [])];
  return {
    async makeInvoice(request) {
      calls.push({ method: "makeInvoice", request });
      return responses.makeInvoice;
    },
    async lookupInvoice(request) {
      calls.push({ method: "lookupInvoice", request });
      const next = lookups.shift() ?? responses.lookupInvoice;
      if (next === undefined) throw new Error("not_found");
      return next;
    },
  };
}
