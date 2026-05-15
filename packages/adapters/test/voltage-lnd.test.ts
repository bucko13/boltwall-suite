import { EventEmitter } from "node:events";

import { describe, expect, test } from "bun:test";

import { LndAdapter } from "../src/lnd";
import {
  VOLTAGE_LND_GRPC_PORT,
  VoltageLndEnvError,
  createVoltageLndAdapter,
  createVoltageLndAdapterFromEnv,
  loadVoltageLndEnv,
} from "../src/voltage-lnd";

const HEX_64 = "11".repeat(32);
const HEX_128 = "ab".repeat(64);
const BASE64_CERT = "base64-cert-fixture";

describe("createVoltageLndAdapter", () => {
  test("returns an LndAdapter with LND capabilities inherited", () => {
    const calls: unknown[] = [];
    const adapter = createVoltageLndAdapter({
      baseUrl: "node-name.m.voltageapp.io",
      macaroon: HEX_128,
      cert: BASE64_CERT,
      api: spyApi(calls),
    });

    expect(adapter).toBeInstanceOf(LndAdapter);
    expect(adapter.kind).toBe("lnd");
    expect(adapter.capabilities).toEqual({
      hodl: true,
      cancelInvoice: true,
      streamingInvoices: true,
      customDescription: true,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      socket: `node-name.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`,
      cert: BASE64_CERT,
      macaroon: HEX_128,
    });
  });

  test("normalizes a bare host to host:10009", () => {
    expectSocket("node.m.voltageapp.io", `node.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`);
  });

  test("preserves an explicit non-REST port", () => {
    expectSocket("node.m.voltageapp.io:10010", "node.m.voltageapp.io:10010");
  });

  test("replaces the documented REST port (8080) with the gRPC port", () => {
    expectSocket("node.m.voltageapp.io:8080", `node.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`);
  });

  test("strips scheme and path from a full https URL", () => {
    expectSocket(
      "https://node.m.voltageapp.io/v1/getinfo?x=1",
      `node.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`,
    );
  });

  test("replaces port 8080 even when supplied via a full URL", () => {
    expectSocket(
      "https://node.m.voltageapp.io:8080/v1/getinfo",
      `node.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`,
    );
  });

  test("rejects an empty baseUrl", () => {
    expect(() =>
      createVoltageLndAdapter({ baseUrl: "   ", macaroon: HEX_128, cert: BASE64_CERT }),
    ).toThrow(RangeError);
  });

  test("rejects an invalid explicit port", () => {
    expect(() =>
      createVoltageLndAdapter({
        baseUrl: "node.m.voltageapp.io:not-a-port",
        macaroon: HEX_128,
        cert: BASE64_CERT,
      }),
    ).toThrow(RangeError);
  });

  test("rejects a malformed URL", () => {
    expect(() =>
      createVoltageLndAdapter({
        baseUrl: "http://:badurl",
        macaroon: HEX_128,
        cert: BASE64_CERT,
      }),
    ).toThrow(RangeError);
  });

  test("does not echo macaroon or cert in baseUrl errors", () => {
    try {
      createVoltageLndAdapter({
        baseUrl: "node.m.voltageapp.io:not-a-port",
        macaroon: "secret-macaroon-DO-NOT-LOG",
        cert: "secret-cert-DO-NOT-LOG",
      });
      throw new Error("expected throw");
    } catch (error) {
      const text = `${(error as Error).name}: ${(error as Error).message}`;
      expect(text).not.toContain("secret-macaroon-DO-NOT-LOG");
      expect(text).not.toContain("secret-cert-DO-NOT-LOG");
    }
  });
});

describe("loadVoltageLndEnv", () => {
  test("returns a valid typed config when every variable is present", () => {
    const env = loadVoltageLndEnv({
      VOLTAGE_LND_BASE_URL: "https://node.m.voltageapp.io ",
      VOLTAGE_LND_MACAROON: HEX_128,
      VOLTAGE_LND_CERT: " base64-cert-fixture\n",
    });
    expect(env).toEqual({
      baseUrl: "https://node.m.voltageapp.io",
      macaroon: HEX_128,
      cert: "base64-cert-fixture",
    });
  });

  test("reports missing variables without leaking their absence to other consumers", () => {
    try {
      loadVoltageLndEnv({});
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VoltageLndEnvError);
      const typed = error as VoltageLndEnvError;
      expect(typed.missing).toEqual([
        "VOLTAGE_LND_BASE_URL",
        "VOLTAGE_LND_MACAROON",
        "VOLTAGE_LND_CERT",
      ]);
      expect(typed.invalid).toEqual([]);
      expect(typed.message).toContain("missing required env");
    }
  });

  test("rejects a non-hex macaroon and does not echo its value", () => {
    const env = {
      VOLTAGE_LND_BASE_URL: "node.m.voltageapp.io",
      VOLTAGE_LND_MACAROON: "not-hex-secret-macaroon",
      VOLTAGE_LND_CERT: BASE64_CERT,
    };
    try {
      loadVoltageLndEnv(env);
      throw new Error("expected throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VoltageLndEnvError);
      const typed = error as VoltageLndEnvError;
      expect(typed.invalid).toEqual(["VOLTAGE_LND_MACAROON"]);
      expect(typed.message).not.toContain("not-hex-secret-macaroon");
    }
  });

  test("rejects a macaroon with odd hex length", () => {
    const env = {
      VOLTAGE_LND_BASE_URL: "node.m.voltageapp.io",
      VOLTAGE_LND_MACAROON: HEX_64.slice(0, HEX_64.length - 1), // odd
      VOLTAGE_LND_CERT: BASE64_CERT,
    };
    expect(() => loadVoltageLndEnv(env)).toThrow(VoltageLndEnvError);
  });
});

describe("createVoltageLndAdapterFromEnv", () => {
  test("composes loadVoltageLndEnv + createVoltageLndAdapter", () => {
    const calls: unknown[] = [];
    const adapter = createVoltageLndAdapterFromEnv(
      {
        VOLTAGE_LND_BASE_URL: "https://node.m.voltageapp.io:8080",
        VOLTAGE_LND_MACAROON: HEX_128,
        VOLTAGE_LND_CERT: BASE64_CERT,
      },
      { api: spyApi(calls) },
    );

    expect(adapter).toBeInstanceOf(LndAdapter);
    expect(calls[0]).toMatchObject({
      socket: `node.m.voltageapp.io:${VOLTAGE_LND_GRPC_PORT}`,
      cert: BASE64_CERT,
      macaroon: HEX_128,
    });
  });
});

function expectSocket(input: string, expected: string): void {
  const calls: unknown[] = [];
  createVoltageLndAdapter({
    baseUrl: input,
    macaroon: HEX_128,
    cert: BASE64_CERT,
    api: spyApi(calls),
  });
  expect(calls).toHaveLength(1);
  const opts = calls[0] as { socket: string };
  expect(opts.socket).toBe(expected);
}

function spyApi(calls: unknown[]) {
  const lnd = {} as never;
  return {
    authenticatedLndGrpc(opts: { socket: string; cert: string; macaroon: string }) {
      calls.push(opts);
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
