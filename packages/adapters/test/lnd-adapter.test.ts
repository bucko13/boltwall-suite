import { EventEmitter } from "node:events";

import { describe, expect, test } from "bun:test";

import { LndAdapter, LndAdapterError } from "../src/lnd";

const PAYMENT_HASH = "1111111111111111111111111111111111111111111111111111111111111111";
const PREIMAGE = "2222222222222222222222222222222222222222222222222222222222222222";
const MACAROON_HEX = "abcdef0123456789".repeat(8);
const CERT_BASE64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=".repeat(3);

describe("LndAdapter", () => {
  test("resolves the TLS cert: passthrough when encoded, PEM and omitted to a CA bundle", () => {
    function capturedCert(cert?: string): string {
      let seen = "";
      new LndAdapter(
        { socket: "127.0.0.1:10009", macaroon: "base64-macaroon", ...(cert === undefined ? {} : { cert }) },
        {
          ...stubApi(),
          authenticatedLndGrpc(auth) {
            seen = auth.cert ?? "";
            return { lnd: {} as never };
          },
        },
      );
      return seen;
    }
    const decode = (b64: string): string => Buffer.from(b64, "base64").toString("utf8");

    // An already base64/hex-encoded cert is passed through unchanged.
    expect(capturedCert("base64-cert")).toBe("base64-cert");
    // A raw PEM is base64-encoded so lightning decodes it back to the PEM.
    const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    expect(decode(capturedCert(pem))).toBe(pem);
    // Omitting the cert (e.g. a managed node with a publicly-trusted cert) yields a
    // CA bundle of Node's system root certificates, so a public issuer is trusted.
    const omitted = decode(capturedCert(undefined));
    expect(omitted).toContain("-----BEGIN CERTIFICATE-----");
  });

  test("creates regular invoices through lightning createInvoice", async () => {
    const calls: unknown[] = [];
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async createInvoice(args) {
        calls.push(args);
        return {
          created_at: new Date(0).toISOString(),
          id: PAYMENT_HASH,
          mtokens: "1500",
          request: "lnbc1500n1regular",
          secret: PREIMAGE,
        };
      },
    });

    const created = await adapter.createInvoice({
      amountMsat: 1_500n,
      description: "pokedex",
      expirySeconds: 60,
    });

    expect(created.paymentRequest).toBe("lnbc1500n1regular");
    expect(created.paymentHash).toBe(PAYMENT_HASH);
    expect(created.amountMsat).toBe(1_500n);
    expect(created.expiresAt).toBeInstanceOf(Date);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      mtokens: "1500",
      description: "pokedex",
    });
  });

  test("creates HODL invoices through lightning createHodlInvoice", async () => {
    const calls: unknown[] = [];
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async createHodlInvoice(args) {
        calls.push(args);
        return {
          created_at: new Date(0).toISOString(),
          description: "hold",
          id: PAYMENT_HASH,
          mtokens: "2000",
          request: "lnbc2000n1hold",
          tokens: 2,
        };
      },
    });

    const created = await adapter.createInvoice({
      amountMsat: 2_000n,
      description: "hold",
      hodl: true,
      paymentHash: PAYMENT_HASH.toUpperCase(),
    });

    expect(created.paymentRequest).toBe("lnbc2000n1hold");
    expect(created.paymentHash).toBe(PAYMENT_HASH);
    expect(created.amountMsat).toBe(2_000n);
    expect(calls[0]).toMatchObject({
      id: PAYMENT_HASH,
      mtokens: "2000",
      description: "hold",
    });
  });

  test("requires a payment hash for HODL invoices", async () => {
    const adapter = new LndAdapter(lndOptions(), stubApi());

    await expect(adapter.createInvoice({ amountMsat: 1_000n, hodl: true })).rejects.toMatchObject({
      kind: "invalid-request",
      message: "lnd-hodl-payment-hash-required",
    });
  });

  test("maps lookup statuses and settled preimages", async () => {
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async getInvoice() {
        return {
          cltv_delta: 40,
          confirmed_at: new Date(1_000).toISOString(),
          created_at: new Date(0).toISOString(),
          description: "paid",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          features: [],
          id: PAYMENT_HASH,
          is_confirmed: true,
          is_private: false,
          payments: [],
          received: 2,
          received_mtokens: "2000",
          secret: PREIMAGE,
          tokens: 2,
        };
      },
    });

    await expect(adapter.lookupInvoice(PAYMENT_HASH)).resolves.toMatchObject({
      status: "settled",
      paymentHash: PAYMENT_HASH,
      amountMsat: 2_000n,
      preimage: PREIMAGE,
    });
  });

  test("maps held HODL invoices before settlement", async () => {
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async getInvoice() {
        return {
          cltv_delta: 40,
          created_at: new Date(0).toISOString(),
          description: "held",
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          features: [],
          id: PAYMENT_HASH,
          is_confirmed: false,
          is_held: true,
          is_private: false,
          payments: [],
          received: 2,
          received_mtokens: "2000",
          secret: PREIMAGE,
          tokens: 2,
        } as never;
      },
    });

    await expect(adapter.lookupInvoice(PAYMENT_HASH)).resolves.toMatchObject({
      status: "held",
      paymentHash: PAYMENT_HASH,
      amountMsat: 2_000n,
    });
  });

  test("wraps cancel, settle, and connection errors with actionable kinds", async () => {
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async cancelHodlInvoice() {
        throw [503, "UnexpectedGrpcError", { err: new Error("14 UNAVAILABLE") }];
      },
    });

    await expect(adapter.cancelInvoice(PAYMENT_HASH)).rejects.toMatchObject({
      kind: "connection-refused",
    });
    await expect(
      () =>
        new LndAdapter(lndOptions(), {
          ...stubApi(),
          authenticatedLndGrpc() {
            throw new Error("permission denied: macaroon invalid");
          },
        }),
    ).toThrow(LndAdapterError);
  });

  test("redacts credential-shaped values from normalized LND errors", async () => {
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      async getInvoice() {
        throw new Error(`permission denied macaroon=${MACAROON_HEX} cert=${CERT_BASE64}`);
      },
    });

    try {
      await adapter.lookupInvoice(PAYMENT_HASH);
      throw new Error("expected lookupInvoice to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(LndAdapterError);
      const message = (error as Error).message;
      expect(message).not.toContain(MACAROON_HEX);
      expect(message).not.toContain(CERT_BASE64);
      expect(message).toContain("[redacted-lnd-credential]");
    }
  });

  test("streams invoice updates from lightning subscriptions", async () => {
    const emitter = new EventEmitter() as EventEmitter & { cancel?: () => void };
    let canceled = false;
    emitter.cancel = () => {
      canceled = true;
    };
    const adapter = new LndAdapter(lndOptions(), {
      ...stubApi(),
      subscribeToInvoices() {
        return emitter;
      },
    });

    const updates = adapter.subscribeInvoices()[Symbol.asyncIterator]();
    const next = updates.next();
    emitter.emit("invoice_updated", {
      cltv_delta: 40,
      created_at: new Date(0).toISOString(),
      description: "open",
      description_hash: "",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      features: [],
      id: PAYMENT_HASH,
      index: 1,
      is_confirmed: false,
      mtokens: "3000",
      payments: [],
      received: 0,
      received_mtokens: "0",
      secret: PREIMAGE,
      tokens: 3,
    });

    await expect(next).resolves.toMatchObject({
      value: {
        status: "open",
        paymentHash: PAYMENT_HASH,
        amountMsat: 3_000n,
      },
    });
    await updates.return?.();

    expect(canceled).toBe(true);
  });
});

function lndOptions() {
  return {
    socket: "127.0.0.1:10009",
    cert: "base64-cert",
    macaroon: "base64-macaroon",
  };
}

function stubApi() {
  const lnd = {} as never;
  return {
    authenticatedLndGrpc() {
      return { lnd };
    },
    async createInvoice() {
      throw new Error("unexpected-createInvoice");
    },
    async createHodlInvoice() {
      throw new Error("unexpected-createHodlInvoice");
    },
    async getInvoice() {
      throw new Error("unexpected-getInvoice");
    },
    async cancelHodlInvoice() {},
    async settleHodlInvoice() {},
    subscribeToInvoices() {
      return new EventEmitter();
    },
  };
}
