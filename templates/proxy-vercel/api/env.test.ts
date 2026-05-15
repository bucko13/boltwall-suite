import { describe, expect, test } from "bun:test";

import { BoltwallTemplateEnvError, createBackend, loadBoltwallEnv } from "./env.js";

describe("loadBoltwallEnv", () => {
  test("loads LND proxy configuration without echoing secrets", () => {
    const config = loadBoltwallEnv({
      TARGET_URL: "https://api.example.com",
      LN_BACKEND: "lnd",
      DEFAULT_PRICE_MSAT: "2500",
      CHALLENGE_COMPATIBILITY: "l402-only",
      UNPROTECTED_PATHS: "/healthz, /robots.txt",
      FORWARD_ALLOW: "accept, x-request-id",
      UPSTREAM_TIMEOUT_MS: "3000",
      LND_SOCKET: "127.0.0.1:10009",
      LND_TLS_CERT: "certificate-value",
      LND_MACAROON: "secret-macaroon",
    });

    expect(config.proxy).toEqual({
      targetUrl: "https://api.example.com",
      defaultPrice: 2500n,
      challengeCompatibility: "l402-only",
      unprotectedPaths: ["/healthz", "/robots.txt"],
      upstreamTimeoutMs: 3000,
      forwardHeaders: {
        allow: ["accept", "x-request-id"],
      },
    });
    expect(config.backend).toEqual({
      kind: "lnd",
      socket: "127.0.0.1:10009",
      cert: "certificate-value",
      macaroon: "secret-macaroon",
    });
  });

  test("loads Voltage LND configuration", () => {
    const config = loadBoltwallEnv({
      TARGET_URL: "https://api.example.com",
      LN_BACKEND: "voltage-lnd",
      VOLTAGE_LND_BASE_URL: "https://node.m.voltageapp.io:8080",
      VOLTAGE_LND_MACAROON: "00ff",
      VOLTAGE_LND_CERT: "certificate-value",
    });

    expect(config.proxy.defaultPrice).toBe(1000n);
    expect(config.proxy.challengeCompatibility).toBe("dual");
    expect(config.backend).toEqual({
      kind: "voltage-lnd",
      baseUrl: "https://node.m.voltageapp.io:8080",
      cert: "certificate-value",
      macaroon: "00ff",
    });
  });

  test("validates backend-specific env and redacts values", () => {
    expect(() =>
      loadBoltwallEnv({
        TARGET_URL: "https://api.example.com",
        LN_BACKEND: "voltage-lnd",
        VOLTAGE_LND_BASE_URL: "https://node.m.voltageapp.io",
        VOLTAGE_LND_MACAROON: "not-secret-but-invalid",
        VOLTAGE_LND_CERT: "secret-cert-value",
      }),
    ).toThrow(/VOLTAGE_LND_MACAROON/u);

    try {
      loadBoltwallEnv({
        TARGET_URL: "https://api.example.com",
        LN_BACKEND: "voltage-lnd",
        VOLTAGE_LND_BASE_URL: "https://node.m.voltageapp.io",
        VOLTAGE_LND_MACAROON: "not-secret-but-invalid",
        VOLTAGE_LND_CERT: "secret-cert-value",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BoltwallTemplateEnvError);
      expect(String(error)).not.toContain("not-secret-but-invalid");
      expect(String(error)).not.toContain("secret-cert-value");
    }
  });

  test("fails fast for OpenNode and BTCPay until adapters are implemented", () => {
    const openNodeConfig = loadBoltwallEnv({
      TARGET_URL: "https://api.example.com",
      LN_BACKEND: "opennode",
      OPENNODE_API_KEY: "secret-api-key",
    });
    const btcPayConfig = loadBoltwallEnv({
      TARGET_URL: "https://api.example.com",
      LN_BACKEND: "btcpay",
      BTCPAY_BASE_URL: "https://btcpay.example.com",
      BTCPAY_API_KEY: "secret-api-key",
      BTCPAY_STORE_ID: "store-id",
    });

    expect(() => createBackend(openNodeConfig.backend)).toThrow(/opennode/u);
    expect(() => createBackend(btcPayConfig.backend)).toThrow(/btcpay/u);
  });
});
