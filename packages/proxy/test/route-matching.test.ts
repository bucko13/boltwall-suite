import { describe, expect, test } from "bun:test";
import type { Request as ExpressRequest } from "express";

import { findMatchingRoute, isPathMatch, type ProxyRoute } from "../src/route-matching";

function req(path: string, method = "GET"): ExpressRequest {
  return { path, method } as ExpressRequest;
}

describe("proxy route matching", () => {
  test("matches exact, wildcard, and regexp paths", () => {
    expect(isPathMatch("/api/data", "/api/data")).toBe(true);
    expect(isPathMatch("/api/*", "/api/data")).toBe(true);
    expect(isPathMatch(/^\/v1\/items\/\d+$/, "/v1/items/42")).toBe(true);
    expect(isPathMatch("/api/data", "/api/other")).toBe(false);
  });

  test("respects method filters and first-match order", () => {
    const routes: ProxyRoute[] = [
      { path: "/paid", methods: ["POST"], price: 1_000n },
      { path: "/paid", methods: ["GET"], price: 2_000n },
    ];

    expect(findMatchingRoute(routes, req("/paid", "GET"))?.price).toBe(2_000n);
    expect(findMatchingRoute(routes, req("/paid", "DELETE"))).toBeUndefined();
  });
});
