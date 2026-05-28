import type { L402Config } from "@boltwall/middleware/core";
import type { Request as ExpressRequest } from "express";

type MiddlewareCaveat = NonNullable<L402Config["caveats"]>[number];
type MiddlewareCaveatFactory = Extract<MiddlewareCaveat, (req: Request) => unknown>;
type CaveatValue = Awaited<ReturnType<MiddlewareCaveatFactory>>;

export type ProxyHttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type ProxyCaveat =
  | CaveatValue
  | ((req: ExpressRequest) => CaveatValue | Promise<CaveatValue>);

/** Route-level price and caveat policy for protected proxy requests. */
export interface ProxyRoute {
  /** Path matcher. String values support exact matches and trailing `*` prefix globs. */
  path: string | RegExp;
  /** Allowed HTTP methods. Defaults to all methods. */
  methods?: ProxyHttpMethod[];
  /** Price in millisatoshis, static or resolved per Express request. */
  price: bigint | ((req: ExpressRequest) => bigint | Promise<bigint>);
  /** Optional caveats, static or resolved per Express request. */
  caveats?: ProxyCaveat[];
}

export function findMatchingRoute(
  routes: readonly ProxyRoute[],
  req: ExpressRequest,
): ProxyRoute | undefined {
  return routes.find((route) => {
    const methodMatches =
      route.methods === undefined ||
      route.methods.some((method) => method.toUpperCase() === req.method.toUpperCase());
    return methodMatches && isPathMatch(route.path, req.path);
  });
}

export function isPathMatch(pattern: string | RegExp, path: string): boolean {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    const matched = pattern.test(path);
    pattern.lastIndex = 0;
    return matched;
  }
  if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}
