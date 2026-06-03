import { describe, expect, test } from "bun:test";

import { loadProxyEnv, proxyEnvVariables } from "../src/env";

const fullProxyEnv = {
  BOLTWALL_PROXY_TARGET_URL: "https://api.example.com",
  BOLTWALL_PROXY_SERVICE: "example-service",
  BOLTWALL_PROXY_DEFAULT_PRICE_MSAT: "2500",
  BOLTWALL_PROXY_UNPROTECTED_PATHS: "/healthz, /public/*",
  BOLTWALL_PROXY_FORWARD_ALLOW: "x-request-id,x-custom-*",
  BOLTWALL_PROXY_FORWARD_DENY: "x-secret-*",
  BOLTWALL_PROXY_CORS_ALLOW_ORIGINS:
    "http://127.0.0.1:3000, https://boltwall-suite-playground.vercel.app",
  BOLTWALL_PROXY_CORS_ALLOW_ORIGIN_PATTERNS: "^https://boltwall-suite-[a-z0-9-]+\\.vercel\\.app$",
  BOLTWALL_PROXY_CORS_EXPOSE_HEADERS: "WWW-Authenticate",
  BOLTWALL_PROXY_CORS_ALLOW_HEADERS: "Authorization, Content-Type",
  BOLTWALL_PROXY_CORS_ALLOW_METHODS: "GET, OPTIONS",
  BOLTWALL_PROXY_CORS_MAX_AGE_SECONDS: "600",
  BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS: "5000",
  BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY: "l402-only",
  BOLTWALL_PROXY_POLICY_VALID_UNTIL_SECONDS: "60",
  BOLTWALL_PROXY_POLICY_ORIGIN:
    "http://127.0.0.1:3000, https://boltwall-suite-playground.vercel.app",
  BOLTWALL_PROXY_CAPABILITIES: "pokedex-read,pokedex-list",
  BOLTWALL_PROXY_PAYWALL_HODL: "true",
};

describe("loadProxyEnv", () => {
  test("exports generated-doc metadata aligned with env parsing coverage", () => {
    const names = proxyEnvVariables.map((variable) => variable.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith("BOLTWALL_PROXY_"))).toBe(true);
    expect(Object.keys(fullProxyEnv).every((name) => names.includes(name))).toBe(true);
    expect(
      proxyEnvVariables.find((variable) => variable.name === "BOLTWALL_PROXY_TARGET_URL"),
    ).toMatchObject({
      required: true,
      valueKind: "url",
      configPath: "targetUrl",
    });
    expect(
      proxyEnvVariables.find(
        (variable) => variable.name === "BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY",
      ),
    ).toMatchObject({
      allowedValues: ["dual", "l402-only", "lsat-only"],
      defaultValue: "dual",
    });
  });

  test("loads proxy config from exported environment variables", () => {
    const config = loadProxyEnv({
      env: fullProxyEnv,
    });

    expect(config).toEqual({
      targetUrl: "https://api.example.com",
      service: "example-service",
      defaultPrice: 2500n,
      unprotectedPaths: ["/healthz", "/public/*"],
      forwardHeaders: {
        allow: ["x-request-id", "x-custom-*"],
        deny: ["x-secret-*"],
      },
      cors: {
        allowOrigins: ["http://127.0.0.1:3000", "https://boltwall-suite-playground.vercel.app"],
        allowOriginPatterns: ["^https://boltwall-suite-[a-z0-9-]+\\.vercel\\.app$"],
        exposeHeaders: ["WWW-Authenticate"],
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: ["GET", "OPTIONS"],
        maxAgeSeconds: 600,
      },
      upstreamTimeoutMs: 5000,
      challengeCompatibility: "l402-only",
      caveats: [expect.any(Function), expect.objectContaining({ condition: "origin" })],
      satisfiers: [
        expect.objectContaining({ condition: "valid-until" }),
        expect.objectContaining({ condition: "origin" }),
      ],
      capabilities: ["pokedex-read", "pokedex-list"],
      hodl: true,
    });
  });

  test("loads optional env files and lets exported variables override file values", () => {
    const config = loadProxyEnv({
      envFile: new URL("./fixtures/proxy.env", import.meta.url).pathname,
      env: {
        BOLTWALL_PROXY_TARGET_URL: "https://override.example.com",
      },
    });

    expect(config).toMatchObject({
      targetUrl: "https://override.example.com",
      service: "file-service",
      defaultPrice: 1000n,
    });
  });

  test("reports invalid values without echoing environment values", () => {
    expect(() =>
      loadProxyEnv({
        env: {
          BOLTWALL_PROXY_TARGET_URL: "not a url with secret-token",
          BOLTWALL_PROXY_DEFAULT_PRICE_MSAT: "1.5",
        },
      }),
    ).toThrow(/BOLTWALL_PROXY_TARGET_URL/);
    expect(() =>
      loadProxyEnv({
        env: {
          BOLTWALL_PROXY_TARGET_URL: "not a url with secret-token",
          BOLTWALL_PROXY_DEFAULT_PRICE_MSAT: "1.5",
        },
      }),
    ).not.toThrow(/secret-token/);
  });

  test("rejects invalid CORS origin pattern values", () => {
    expect(() =>
      loadProxyEnv({
        env: {
          BOLTWALL_PROXY_TARGET_URL: "https://api.example.com",
          BOLTWALL_PROXY_CORS_ALLOW_ORIGIN_PATTERNS: "[",
        },
      }),
    ).toThrow(/BOLTWALL_PROXY_CORS_ALLOW_ORIGIN_PATTERNS/);
  });

  test("requires service when capability caveats are configured", () => {
    expect(() =>
      loadProxyEnv({
        env: {
          BOLTWALL_PROXY_TARGET_URL: "https://api.example.com",
          BOLTWALL_PROXY_CAPABILITIES: "pokedex-read",
        },
      }),
    ).toThrow(/BOLTWALL_PROXY_SERVICE is required/);
  });
});
