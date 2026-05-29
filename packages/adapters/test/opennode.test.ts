import { describe, expect, test } from "bun:test";

import { assertBackendSupports, BackendCapabilityError } from "../src";
import {
  OpenNodeAdapter,
  OpenNodeAdapterError,
  OpenNodeApiError,
  OpenNodeEnvError,
  createOpenNodeAdapterFromEnv,
  loadOpenNodeEnv,
  type OpenNodeChargeStore,
  type OpenNodeFetch,
} from "../src/opennode";

const API_KEY = "opennode-secret-key";
const PAYMENT_HASH = "11".repeat(32);
const PAYREQ = "lnbc-fake-for-unit-tests";

describe("OpenNodeAdapter", () => {
  test("creates a charge and hides OpenNode charge ids behind payment hash lookup", async () => {
    const calls: RequestCall[] = [];
    const store = new MapChargeStore();
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub(calls, [
        jsonResponse(201, {
          data: chargeResponse({
            status: "unpaid",
            amount: 2,
            lightning_invoice: {
              payreq: PAYREQ,
              expires_at: 1_900_000_000,
            },
          }),
        }),
        jsonResponse(200, {
          data: chargeResponse({ status: "paid", amount: 2 }),
        }),
      ]),
      chargeStore: store,
      decodeInvoice: () => ({
        paymentHashHex: PAYMENT_HASH,
        amountMsat: 2_000n,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    });

    const created = await adapter.createInvoice({
      amountMsat: 2_000n,
      description: "pokedex",
      expirySeconds: 600,
      metadata: { orderId: "order-123" },
    });
    const lookup = await adapter.lookupInvoice(created.paymentHash);

    expect(created).toEqual({
      paymentRequest: PAYREQ,
      paymentHash: PAYMENT_HASH,
      amountMsat: 2_000n,
      expiresAt: new Date(1_900_000_000_000),
    });
    expect(lookup).toEqual({
      status: "settled",
      paymentHash: PAYMENT_HASH,
      amountMsat: 2_000n,
    });
    expect(store.get(PAYMENT_HASH)).toBe("charge-123");
    expect(calls[0]).toMatchObject({
      url: "https://api.opennode.com/v1/charges",
      method: "POST",
      authorization: API_KEY,
      body: {
        amount: 2,
        description: "pokedex",
        ttl: 10,
        order_id: "order-123",
      },
    });
    expect(calls[1]?.url).toBe("https://api.opennode.com/v2/charge/charge-123");
  });

  test("supports the documented development API base URL", async () => {
    const calls: RequestCall[] = [];
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      baseUrl: "https://dev-api.opennode.com",
      fetch: fetchStub(calls, [
        jsonResponse(201, {
          data: chargeResponse({
            lightning_invoice: { payreq: PAYREQ, expires_at: 1_900_000_000 },
          }),
        }),
      ]),
      decodeInvoice: () => ({
        paymentHashHex: PAYMENT_HASH,
        amountMsat: 1_000n,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    });

    await adapter.createInvoice({ amountMsat: 1_000n });

    expect(calls[0]?.url).toBe("https://dev-api.opennode.com/v1/charges");
  });

  test("rejects HODL and millisatoshi amounts that OpenNode cannot represent", async () => {
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub([], []),
      decodeInvoice: () => {
        throw new Error("unexpected-decode");
      },
    });

    await expect(adapter.createInvoice({ amountMsat: 1_000n, hodl: true })).rejects.toMatchObject({
      kind: "unsupported-feature",
      message: "OpenNode does not support HODL invoices",
    });
    await expect(adapter.createInvoice({ amountMsat: 1_001n })).rejects.toMatchObject({
      kind: "invalid-request",
      message: "OpenNode invoice amount must be an integer number of satoshis",
    });
  });

  test("maps every documented charge status conservatively", async () => {
    const statuses = [
      ["unpaid", "open"],
      ["processing", "open"],
      ["underpaid", "open"],
      ["paid", "settled"],
      ["expired", "expired"],
      ["refunded", "canceled"],
    ] as const;
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub(
        [],
        [
          jsonResponse(201, {
            data: chargeResponse({
              lightning_invoice: { payreq: PAYREQ, expires_at: 1_900_000_000 },
            }),
          }),
          ...statuses.map(([status]) => jsonResponse(200, { data: chargeResponse({ status }) })),
        ],
      ),
      decodeInvoice: () => ({
        paymentHashHex: PAYMENT_HASH,
        amountMsat: 1_000n,
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      }),
    });
    const created = await adapter.createInvoice({ amountMsat: 1_000n });

    for (const [, expected] of statuses) {
      await expect(adapter.lookupInvoice(created.paymentHash)).resolves.toMatchObject({
        status: expected,
      });
    }
  });

  test("requires a retained charge id for lookup", async () => {
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub([], []),
    });

    await expect(adapter.lookupInvoice(PAYMENT_HASH)).rejects.toMatchObject({
      kind: "not-found",
    });
  });

  test.each([1.25, Number.MAX_SAFE_INTEGER + 1])(
    "rejects lossy lookup charge amounts instead of truncating %p",
    async (amount) => {
      const adapter = new OpenNodeAdapter({
        apiKey: API_KEY,
        fetch: fetchStub(
          [],
          [
            jsonResponse(201, {
              data: chargeResponse({
                amount: 2,
                lightning_invoice: { payreq: PAYREQ, expires_at: 1_900_000_000 },
              }),
            }),
            jsonResponse(200, {
              data: chargeResponse({ status: "paid", amount }),
            }),
          ],
        ),
        decodeInvoice: () => ({
          paymentHashHex: PAYMENT_HASH,
          amountMsat: 2_000n,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        }),
      });

      const created = await adapter.createInvoice({ amountMsat: 2_000n });

      await expect(adapter.lookupInvoice(created.paymentHash)).rejects.toMatchObject({
        kind: "invalid-response",
        message: "OpenNode charge amount must be a non-negative safe integer number of satoshis",
      });
    },
  );

  test("fails on malformed provider responses without leaking invoices", async () => {
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub(
        [],
        [
          jsonResponse(201, {
            data: chargeResponse({
              lightning_invoice: { payreq: undefined, expires_at: 1_900_000_000 },
            }),
          }),
        ],
      ),
    });

    await expect(adapter.createInvoice({ amountMsat: 1_000n })).rejects.toBeInstanceOf(
      OpenNodeAdapterError,
    );
  });

  test("redacts API keys and BOLT 11 invoices from HTTP error messages", async () => {
    const invoice = `lnbc${"a".repeat(80)}`;
    const adapter = new OpenNodeAdapter({
      apiKey: API_KEY,
      fetch: fetchStub(
        [],
        [
          jsonResponse(401, {
            message: `bad key ${API_KEY} for ${invoice}`,
          }),
        ],
      ),
      decodeInvoice: () => {
        throw new Error("unexpected-decode");
      },
    });

    try {
      await adapter.createInvoice({ amountMsat: 1_000n });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenNodeApiError);
      const message = (error as Error).message;
      expect(message).not.toContain(API_KEY);
      expect(message).not.toContain(invoice);
      expect(message).toContain("[redacted-opennode-api-key]");
      expect(message).toContain("[redacted-bolt11]");
    }
  });

  test.each([
    { hodlInvoices: true },
    { streamingInvoices: true },
  ])("rejects unsupported feature flags at construction (%o)", (features) => {
    try {
      new OpenNodeAdapter({ apiKey: API_KEY, features });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenNodeAdapterError);
      expect((error as OpenNodeAdapterError).kind).toBe("unsupported-feature");
    }
  });

  test("has capability flags that reject HODL at boot-time validation", () => {
    const adapter = new OpenNodeAdapter({ apiKey: API_KEY });

    expect(adapter.capabilities).toEqual({
      hodl: false,
      cancelInvoice: false,
      streamingInvoices: false,
      customDescription: true,
    });
    expect(() => assertBackendSupports(adapter, { hodl: true })).toThrow(BackendCapabilityError);
  });
});

describe("loadOpenNodeEnv", () => {
  test("returns valid typed config", () => {
    expect(
      loadOpenNodeEnv({
        OPENNODE_API_KEY: " secret ",
        OPENNODE_BASE_URL: " https://dev-api.opennode.com ",
      }),
    ).toEqual({
      apiKey: "secret",
      baseUrl: "https://dev-api.opennode.com",
    });
  });

  test("reports missing and invalid variables without echoing values", () => {
    try {
      loadOpenNodeEnv({
        OPENNODE_BASE_URL: "http://opennode.example",
      });
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenNodeEnvError);
      const typed = error as OpenNodeEnvError;
      expect(typed.missing).toEqual(["OPENNODE_API_KEY"]);
      expect(typed.invalid).toEqual(["OPENNODE_BASE_URL"]);
      expect(typed.message).not.toContain("http://opennode.example");
    }
  });
});

describe("createOpenNodeAdapterFromEnv", () => {
  test("composes env loading and adapter construction", async () => {
    const calls: RequestCall[] = [];
    const adapter = createOpenNodeAdapterFromEnv(
      {
        OPENNODE_API_KEY: API_KEY,
        OPENNODE_BASE_URL: "https://dev-api.opennode.com",
      },
      {
        fetch: fetchStub(calls, [
          jsonResponse(201, {
            data: chargeResponse({
              lightning_invoice: { payreq: PAYREQ, expires_at: 1_900_000_000 },
            }),
          }),
        ]),
        decodeInvoice: () => ({
          paymentHashHex: PAYMENT_HASH,
          amountMsat: 1_000n,
          expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        }),
      },
    );

    await adapter.createInvoice({ amountMsat: 1_000n });

    expect(calls[0]?.url).toBe("https://dev-api.opennode.com/v1/charges");
  });
});

interface RequestCall {
  url: string;
  method: string | undefined;
  authorization: string | undefined;
  body: unknown;
}

class MapChargeStore implements OpenNodeChargeStore {
  readonly #values = new Map<string, string>();

  get(paymentHash: string): string | undefined {
    return this.#values.get(paymentHash);
  }

  set(paymentHash: string, chargeId: string): void {
    this.#values.set(paymentHash, chargeId);
  }
}

function fetchStub(calls: RequestCall[], responses: Response[]): OpenNodeFetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method,
      authorization: headers.get("Authorization") ?? undefined,
      body:
        typeof init?.body === "string" && init.body !== ""
          ? (JSON.parse(init.body) as unknown)
          : undefined,
    });
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("unexpected-fetch-call");
    }
    return response;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function chargeResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "charge-123",
    status: "unpaid",
    amount: 1,
    lightning_invoice: {
      payreq: PAYREQ,
      expires_at: 1_900_000_000,
    },
    ...overrides,
  };
}
