import { describe, expect, test } from "bun:test";

import { loadProxyEnv } from "../src/env";

describe("loadProxyEnv", () => {
  test("loads proxy config from exported environment variables", () => {
    const config = loadProxyEnv({
      env: {
        BOLTWALL_PROXY_TARGET_URL: "https://api.example.com",
        BOLTWALL_PROXY_SERVICE: "example-service",
        BOLTWALL_PROXY_DEFAULT_PRICE_MSAT: "2500",
        BOLTWALL_PROXY_UNPROTECTED_PATHS: "/healthz, /public/*",
        BOLTWALL_PROXY_FORWARD_ALLOW: "x-request-id,x-custom-*",
        BOLTWALL_PROXY_FORWARD_DENY: "x-secret-*",
        BOLTWALL_PROXY_UPSTREAM_TIMEOUT_MS: "5000",
        BOLTWALL_PROXY_CHALLENGE_COMPATIBILITY: "l402-only",
      },
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
      upstreamTimeoutMs: 5000,
      challengeCompatibility: "l402-only",
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
});
