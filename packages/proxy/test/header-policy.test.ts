import type { ClientRequest } from "node:http";

import { describe, expect, test } from "bun:test";

import type { Request as ExpressRequest } from "express";

import { applyForwardHeaderPolicy, shouldForwardHeader } from "../src/header-policy";

describe("proxy header policy", () => {
  test("never strips the Host header, even under an allow-list", () => {
    // changeOrigin sets Host to the upstream; stripping it leaves no Host and
    // CDN-fronted upstreams (e.g. Cloudflare) reject the request with 400.
    const removed: string[] = [];
    const proxyReq = { removeHeader: (name: string) => removed.push(name) } as unknown as ClientRequest;
    const req = {
      headers: { host: "proxy.example", "user-agent": "curl", accept: "application/json" },
    } as unknown as ExpressRequest;

    applyForwardHeaderPolicy(proxyReq, req, { allow: ["accept"] });

    expect(removed).toContain("user-agent");
    expect(removed).not.toContain("host");
  });

  test("strips bearer credentials and cookies by default", () => {
    expect(shouldForwardHeader("authorization")).toBe(false);
    expect(shouldForwardHeader("Cookie")).toBe(false);
    expect(shouldForwardHeader("x-request-id")).toBe(true);
  });

  test("applies allow patterns before forwarding non-denied headers", () => {
    const policy = { allow: ["x-custom-*"] };

    expect(shouldForwardHeader("x-custom-foo", policy)).toBe(true);
    expect(shouldForwardHeader("x-other", policy)).toBe(false);
    expect(shouldForwardHeader("cookie", policy)).toBe(false);
  });

  test("applies explicit deny patterns case-insensitively", () => {
    const policy = { deny: ["x-secret-*"] };

    expect(shouldForwardHeader("X-Secret-Token", policy)).toBe(false);
    expect(shouldForwardHeader("X-Public-Token", policy)).toBe(true);
  });
});
