import { describe, expect, test } from "bun:test";

import { assertBackendSupports, BackendCapabilityError } from "../src";
import {
  LndRestAdapter,
  LndRestAdapterError,
  type LndRestAdapterOptions,
} from "../src/lnd/rest";
import type { LndRestHttpRequest, LndRestHttpResponse, LndRestTransport } from "../src/lnd/rest-client";

const PAYMENT_HASH_HEX = "11".repeat(32);
const PREIMAGE_HEX = "22".repeat(32);
const PAYREQ = "lnbc10n1fakeinvoiceforunittests";
// LND_MACAROON is conventionally base64; the REST header needs hex.
const MACAROON_HEX = "0a0b0c0d0e0f";
const MACAROON_BASE64 = Buffer.from(MACAROON_HEX, "hex").toString("base64");

function hexToBase64(hex: string): string {
  return Buffer.from(hex, "hex").toString("base64");
}

interface StubExchange {
  status?: number;
  body: unknown;
}

function transportStub(exchanges: StubExchange[]): {
  transport: LndRestTransport;
  calls: LndRestHttpRequest[];
} {
  const calls: LndRestHttpRequest[] = [];
  let index = 0;
  const transport: LndRestTransport = async (request): Promise<LndRestHttpResponse> => {
    calls.push(request);
    const exchange = exchanges[index++];
    if (exchange === undefined) {
      throw new Error(`unexpected request #${index}`);
    }
    return {
      status: exchange.status ?? 200,
      body: typeof exchange.body === "string" ? exchange.body : JSON.stringify(exchange.body),
    };
  };
  return { transport, calls };
}

function adapter(
  exchanges: StubExchange[],
  overrides: Partial<LndRestAdapterOptions> = {},
): { adapter: LndRestAdapter; calls: LndRestHttpRequest[] } {
  const { transport, calls } = transportStub(exchanges);
  return {
    adapter: new LndRestAdapter({
      baseUrl: "https://node.voltageapp.io:8080",
      macaroon: MACAROON_HEX,
      transport,
      ...overrides,
    }),
    calls,
  };
}

describe("LndRestAdapter", () => {
  test("advertises a REST-only capability set", () => {
    const { adapter: a } = adapter([]);
    expect(a.kind).toBe("lnd");
    expect(a.capabilities).toEqual({
      hodl: false,
      cancelInvoice: false,
      streamingInvoices: false,
      customDescription: true,
    });
    assertBackendSupports(a, { customDescription: true });
    expect(() => assertBackendSupports(a, { hodl: true })).toThrow(BackendCapabilityError);
  });

  test("creates an invoice via POST /v1/invoices with the macaroon header", async () => {
    const { adapter: a, calls } = adapter([
      { body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), payment_request: PAYREQ } },
    ]);

    const created = await a.createInvoice({
      amountMsat: 1_000n,
      description: "Pokedex",
      expirySeconds: 600,
    });

    expect(created).toEqual({
      paymentRequest: PAYREQ,
      paymentHash: PAYMENT_HASH_HEX,
      amountMsat: 1_000n,
      expiresAt: expect.any(Date),
    });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.method).toBe("POST");
    expect(call.url).toBe("https://node.voltageapp.io:8080/v1/invoices");
    expect(call.headers["Grpc-Metadata-macaroon"]).toBe(MACAROON_HEX);
    expect(JSON.parse(call.body!)).toEqual({
      value_msat: "1000",
      memo: "Pokedex",
      expiry: "600",
    });
  });

  test("accepts a base64 macaroon and converts it to hex for the header", async () => {
    const { adapter: a, calls } = adapter(
      [{ body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), payment_request: PAYREQ } }],
      { macaroon: MACAROON_BASE64 },
    );
    await a.createInvoice({ amountMsat: 1_000n });
    expect(calls[0]!.headers["Grpc-Metadata-macaroon"]).toBe(MACAROON_HEX);
  });

  test("passes a TLS agent to the transport only when a cert is supplied", async () => {
    const withCert = adapter(
      [{ body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), payment_request: PAYREQ } }],
      { cert: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----" },
    );
    await withCert.adapter.createInvoice({ amountMsat: 1_000n });
    expect(withCert.calls[0]!.agent).toBeDefined();

    const withoutCert = adapter([
      { body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), payment_request: PAYREQ } },
    ]);
    await withoutCert.adapter.createInvoice({ amountMsat: 1_000n });
    expect(withoutCert.calls[0]!.agent).toBeUndefined();
  });

  test("rejects HODL, negative amounts, and non-positive expiry before any request", async () => {
    const { adapter: a, calls } = adapter([]);
    await expect(
      a.createInvoice({ amountMsat: 1_000n, hodl: true, paymentHash: PAYMENT_HASH_HEX }),
    ).rejects.toThrow(LndRestAdapterError);
    await expect(a.createInvoice({ amountMsat: -1n })).rejects.toThrow("cannot be negative");
    await expect(a.createInvoice({ amountMsat: 1_000n, expirySeconds: 0 })).rejects.toThrow(
      "must be positive",
    );
    expect(calls).toHaveLength(0);
  });

  test("looks up a settled invoice and exposes the hex preimage", async () => {
    const { adapter: a, calls } = adapter([
      {
        body: {
          r_hash: hexToBase64(PAYMENT_HASH_HEX),
          r_preimage: hexToBase64(PREIMAGE_HEX),
          value_msat: "1000",
          state: "SETTLED",
          settled: true,
          settle_date: "1700000000",
        },
      },
    ]);

    const lookup = await a.lookupInvoice(PAYMENT_HASH_HEX);

    expect(lookup).toEqual({
      status: "settled",
      paymentHash: PAYMENT_HASH_HEX,
      amountMsat: 1_000n,
      settledAt: new Date(1_700_000_000 * 1000),
      preimage: PREIMAGE_HEX,
    });
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url).toBe(`https://node.voltageapp.io:8080/v1/invoice/${PAYMENT_HASH_HEX}`);
  });

  test("maps invoice state to normalized status and omits the preimage when unsettled", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ state: "OPEN" }, "open"],
      [{ state: "ACCEPTED" }, "held"],
      [{ state: "CANCELED" }, "canceled"],
      [{ state: "SETTLED", settled: true }, "settled"],
      // Expired: an OPEN invoice whose creation_date + expiry is in the past.
      [{ state: "OPEN", creation_date: "1000", expiry: "60" }, "expired"],
    ];
    for (const [fields, expected] of cases) {
      const { adapter: a } = adapter([
        { body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), value_msat: "1000", ...fields } },
      ]);
      const lookup = await a.lookupInvoice(PAYMENT_HASH_HEX);
      expect(lookup.status).toBe(expected as never);
      expect(lookup.preimage).toBeUndefined();
    }
  });

  test("derives amountMsat from sat-denominated value when value_msat is absent", async () => {
    const { adapter: a } = adapter([
      { body: { r_hash: hexToBase64(PAYMENT_HASH_HEX), value: "7", state: "OPEN" } },
    ]);
    const lookup = await a.lookupInvoice(PAYMENT_HASH_HEX);
    expect(lookup.amountMsat).toBe(7_000n);
  });

  test("classifies HTTP errors from status codes", async () => {
    const expectations: Array<[number, string]> = [
      [401, "unauthorized"],
      [404, "not-found"],
      [500, "connection-refused"],
      [400, "invalid-request"],
    ];
    for (const [status, kind] of expectations) {
      const { adapter: a } = adapter([{ status, body: { error: "nope" } }]);
      try {
        await a.lookupInvoice(PAYMENT_HASH_HEX);
        throw new Error("expected lookup to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(LndRestAdapterError);
        expect((error as LndRestAdapterError).kind).toBe(kind as never);
      }
    }
  });

  test("surfaces a transport failure as connection-refused", async () => {
    const transport: LndRestTransport = () => Promise.reject(new Error("ECONNREFUSED"));
    const a = new LndRestAdapter({
      baseUrl: "https://node.voltageapp.io:8080",
      macaroon: MACAROON_HEX,
      transport,
    });
    try {
      await a.lookupInvoice(PAYMENT_HASH_HEX);
      throw new Error("expected lookup to throw");
    } catch (error) {
      expect((error as LndRestAdapterError).kind).toBe("connection-refused");
    }
  });

  test("rejects a non-HTTPS base URL and an out-of-range payment hash", async () => {
    expect(
      () => new LndRestAdapter({ baseUrl: "http://node:8080", macaroon: MACAROON_HEX }),
    ).toThrow(LndRestAdapterError);

    const { adapter: a } = adapter([
      { body: { r_hash: hexToBase64("11".repeat(31)), payment_request: PAYREQ } },
    ]);
    await expect(a.createInvoice({ amountMsat: 1_000n })).rejects.toThrow("32 bytes");

    const { adapter: b } = adapter([]);
    await expect(b.lookupInvoice("not-hex")).rejects.toThrow("hex");
  });
});
