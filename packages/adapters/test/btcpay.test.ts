import { describe, expect, test } from "bun:test";

import { assertBackendSupports } from "../src";
import {
  BtcPayAdapter,
  BtcPayAdapterError,
  BtcPayEnvError,
  createBtcPayAdapterFromEnv,
  loadBtcPayEnv,
  type BtcPayFetch,
} from "../src/btcpay";

const API_KEY = "secret-btcpay-api-key";
const PAYMENT_HASH = "aa".repeat(32);
const PREIMAGE = "bb".repeat(32);
const EXPIRES_AT_SECONDS = Date.parse("2026-05-15T14:15:00.000Z") / 1000;
const PAID_AT_SECONDS = Date.parse("2026-05-15T14:21:40.000Z") / 1000;
const EXPIRED_AT_SECONDS = Date.parse("2026-05-15T13:00:00.000Z") / 1000;

describe("BtcPayAdapter", () => {
  test("uses conservative default capabilities", () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: responseFetch(lightningInvoice()),
    });

    expect(adapter.kind).toBe("btcpay");
    expect(adapter.capabilities).toEqual({
      hodl: false,
      cancelInvoice: false,
      streamingInvoices: false,
      customDescription: true,
    });
    expect(() => assertBackendSupports(adapter, { hodl: true })).toThrow(
      "does not support HODL invoices",
    );
  });

  test("requires HTTPS for non-local credentialed requests", () => {
    expect(
      () =>
        new BtcPayAdapter({
          baseUrl: "http://btcpay.example",
          apiKey: API_KEY,
          storeId: "store-123",
        }),
    ).toThrow("BTCPay baseUrl must use HTTPS");
  });

  test("allows HTTP localhost for local BTCPay test deployments", async () => {
    const calls: RecordedRequest[] = [];
    const adapter = new BtcPayAdapter({
      baseUrl: "http://localhost:23000/root",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: recordingFetch(calls, [lightningInvoice({ amount: "1" })]),
    });

    await expect(adapter.createInvoice({ amountMsat: 1n })).resolves.toMatchObject({
      paymentHash: PAYMENT_HASH,
      amountMsat: 1n,
    });
    expect(calls[0]?.url).toBe(
      "http://localhost:23000/root/api/v1/stores/store-123/lightning/BTC/invoices",
    );
  });

  test("creates a Lightning invoice with documented Greenfield request shape", async () => {
    const calls: RecordedRequest[] = [];
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: recordingFetch(calls, [lightningInvoice({ id: "provider-id-1" })]),
    });

    const invoice = await adapter.createInvoice({
      amountMsat: 123_456n,
      description: "Boltwall access",
      expirySeconds: 300,
    });

    expect(invoice).toEqual({
      paymentRequest: "lnbc1fixture",
      paymentHash: PAYMENT_HASH,
      amountMsat: 123_456n,
      expiresAt: new Date("2026-05-15T14:15:00.000Z"),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://btcpay.example/api/v1/stores/store-123/lightning/BTC/invoices",
      authorization: `token ${API_KEY}`,
      body: {
        amount: "123456",
        description: "Boltwall access",
        expiry: 300,
      },
    });
  });

  test("rejects malformed invoice responses as invalid BTCPay responses", async () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: responseFetch({ id: "provider-id" }),
    });

    await expect(adapter.createInvoice({ amountMsat: 1_000n })).rejects.toMatchObject({
      kind: "invalid-response",
    });
  });

  test("rejects created invoices with a mismatched returned amount", async () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: responseFetch(lightningInvoice({ amount: "999" })),
    });

    await expect(adapter.createInvoice({ amountMsat: 1_000n })).rejects.toMatchObject({
      kind: "invalid-response",
      message: "BTCPay invoice amount did not match the requested amount",
    });
  });

  test("looks up by payment hash while hiding the provider invoice id", async () => {
    const calls: RecordedRequest[] = [];
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example/root/",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: recordingFetch(calls, [
        lightningInvoice({ id: "btcpay-provider-id", amount: "1000" }),
        lightningInvoice({ id: "btcpay-provider-id", status: "Paid", paidAt: PAID_AT_SECONDS }),
      ]),
    });

    const created = await adapter.createInvoice({ amountMsat: 1_000n });
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(lookup).toEqual({
      status: "settled",
      paymentHash: PAYMENT_HASH,
      amountMsat: 123_456n,
      settledAt: new Date("2026-05-15T14:21:40.000Z"),
      preimage: PREIMAGE,
    });
    expect(calls[1]?.url).toBe(
      "https://btcpay.example/root/api/v1/stores/store-123/lightning/BTC/invoices/btcpay-provider-id",
    );
    expect(calls[1]?.url).not.toContain(PAYMENT_HASH);
  });

  test.each([
    ["Unpaid", "open"],
    ["Paid", "settled"],
    ["Expired", "expired"],
  ] as const)("maps documented Lightning status %s", async (btcpayStatus, expected) => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: recordingFetch(
        [],
        [
          lightningInvoice({ id: "provider-id", amount: "1000" }),
          lightningInvoice({ id: "provider-id", status: btcpayStatus }),
        ],
      ),
      clock: fixedClock("2026-05-15T14:00:00.000Z"),
    });
    const created = await adapter.createInvoice({ amountMsat: 1_000n });

    await expect(adapter.lookupInvoice(created.paymentHash)).resolves.toMatchObject({
      status: expected,
      paymentHash: PAYMENT_HASH,
    });
  });

  test("treats an expired Unpaid invoice as expired", async () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: recordingFetch(
        [],
        [
          lightningInvoice({ id: "provider-id", amount: "1000" }),
          lightningInvoice({ id: "provider-id", status: "Unpaid", expiresAt: EXPIRED_AT_SECONDS }),
        ],
      ),
      clock: fixedClock("2026-05-15T14:21:40.000Z"),
    });

    const created = await adapter.createInvoice({ amountMsat: 1_000n });

    await expect(adapter.lookupInvoice(created.paymentHash)).resolves.toMatchObject({
      status: "expired",
    });
  });

  test("rejects HODL features at boot and HODL requests at call time", async () => {
    expect(
      () =>
        new BtcPayAdapter({
          baseUrl: "https://btcpay.example",
          apiKey: API_KEY,
          storeId: "store-123",
          features: { hodlInvoices: true },
        }),
    ).toThrow(BtcPayAdapterError);

    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: responseFetch(lightningInvoice()),
    });

    await expect(
      adapter.createInvoice({ amountMsat: 1_000n, hodl: true, paymentHash: PAYMENT_HASH }),
    ).rejects.toThrow("HODL invoice creation is not supported");
  });

  test("rejects unsupported streaming feature flags at boot", () => {
    expect(
      () =>
        new BtcPayAdapter({
          baseUrl: "https://btcpay.example",
          apiKey: API_KEY,
          storeId: "store-123",
          features: { streamingInvoices: true },
        }),
    ).toThrow("invoice streaming is not implemented");
  });

  test("redacts API keys and response details from HTTP errors", async () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: async () =>
        jsonResponse(
          {
            title: "Unauthorized secret-btcpay-api-key",
            detail: "raw API key secret-btcpay-api-key should not leak",
          },
          401,
        ),
    });

    await expect(adapter.createInvoice({ amountMsat: 1_000n })).rejects.toMatchObject({
      kind: "unauthorized",
    });
    try {
      await adapter.createInvoice({ amountMsat: 1_000n });
      throw new Error("expected createInvoice to throw");
    } catch (error) {
      const message = `${(error as Error).name}: ${(error as Error).message}`;
      expect(message).not.toContain(API_KEY);
      expect(message).not.toContain("raw API key");
      expect(message).toContain("[redacted]");
    }
  });

  test("throws not-found before lookup when the provider id mapping is unknown", async () => {
    const adapter = new BtcPayAdapter({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      fetch: responseFetch(lightningInvoice()),
    });

    await expect(adapter.lookupInvoice(PAYMENT_HASH)).rejects.toMatchObject({
      kind: "not-found",
    });
  });
});

describe("loadBtcPayEnv", () => {
  test("returns a typed config with defaults", () => {
    expect(
      loadBtcPayEnv({
        BTCPAY_BASE_URL: "https://btcpay.example ",
        BTCPAY_API_KEY: API_KEY,
        BTCPAY_STORE_ID: " store-123",
      }),
    ).toEqual({
      baseUrl: "https://btcpay.example",
      apiKey: API_KEY,
      storeId: "store-123",
      cryptoCode: "BTC",
      features: {
        hodlInvoices: false,
        streamingInvoices: false,
      },
    });
  });

  test("parses optional crypto code and feature booleans", () => {
    expect(
      loadBtcPayEnv({
        BTCPAY_BASE_URL: "http://localhost:23000",
        BTCPAY_API_KEY: API_KEY,
        BTCPAY_STORE_ID: "store-123",
        BTCPAY_CRYPTO_CODE: "btc",
        BTCPAY_HODL_INVOICES: "0",
        BTCPAY_STREAMING_INVOICES: "false",
      }),
    ).toMatchObject({
      cryptoCode: "BTC",
      features: {
        hodlInvoices: false,
        streamingInvoices: false,
      },
    });
  });

  test("reports missing and invalid env without leaking secrets", () => {
    try {
      loadBtcPayEnv({
        BTCPAY_BASE_URL: "not-a-url",
        BTCPAY_API_KEY: API_KEY,
        BTCPAY_HODL_INVOICES: "yes",
      });
      throw new Error("expected loadBtcPayEnv to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BtcPayEnvError);
      const typed = error as BtcPayEnvError;
      expect(typed.missing).toEqual(["BTCPAY_STORE_ID"]);
      expect(typed.invalid).toEqual(["BTCPAY_BASE_URL", "BTCPAY_HODL_INVOICES"]);
      expect(typed.message).not.toContain(API_KEY);
    }
  });

  test("createBtcPayAdapterFromEnv rejects unsupported HODL config at boot", () => {
    expect(() =>
      createBtcPayAdapterFromEnv({
        BTCPAY_BASE_URL: "https://btcpay.example",
        BTCPAY_API_KEY: API_KEY,
        BTCPAY_STORE_ID: "store-123",
        BTCPAY_HODL_INVOICES: "true",
      }),
    ).toThrow("HODL invoices are not supported");
  });
});

interface RecordedRequest {
  url: string;
  method: string;
  authorization: string | null;
  body?: unknown;
}

function recordingFetch(calls: RecordedRequest[], bodies: unknown[]): BtcPayFetch {
  return async (input, init) => {
    const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    calls.push({
      url: input.toString(),
      method: init?.method ?? "GET",
      authorization: new Headers(init?.headers).get("authorization"),
      ...(body === undefined ? {} : { body }),
    });
    const next = bodies.shift();
    if (next === undefined) {
      throw new Error("unexpected BTCPay fetch call");
    }
    return jsonResponse(next);
  };
}

function responseFetch(body: unknown): BtcPayFetch {
  return async () => jsonResponse(body);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lightningInvoice(
  overrides: Partial<{
    id: string;
    status: "Expired" | "Paid" | "Unpaid";
    paidAt: number | null;
    expiresAt: number;
    amount: string;
    paymentHash: string;
    preimage: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? "provider-id",
    status: overrides.status ?? "Unpaid",
    BOLT11: "lnbc1fixture",
    paidAt: overrides.paidAt ?? null,
    expiresAt: overrides.expiresAt ?? EXPIRES_AT_SECONDS,
    amount: overrides.amount ?? "123456",
    amountReceived: "0",
    paymentHash: overrides.paymentHash ?? PAYMENT_HASH,
    preimage: overrides.preimage ?? PREIMAGE,
  };
}

function fixedClock(iso: string) {
  return {
    now() {
      return new Date(iso);
    },
  };
}
