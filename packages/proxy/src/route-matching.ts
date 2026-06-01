import type { L402Config } from "@boltwall/middleware/core";
import type { Request as ExpressRequest } from "express";

type MiddlewareCaveat = NonNullable<L402Config["caveats"]>[number];
type MiddlewareCaveatFactory = Extract<MiddlewareCaveat, (req: Request) => unknown>;
type CaveatValue = Awaited<ReturnType<MiddlewareCaveatFactory>>;

/** HTTP methods accepted by route-level proxy policy. */
export type ProxyHttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/** Static or request-derived caveat attached to a protected proxy route. */
export type ProxyCaveat =
  | CaveatValue
  | ((req: ExpressRequest) => CaveatValue | Promise<CaveatValue>);

/**
 * Route-level price and caveat policy for protected proxy requests.
 *
 * Routes are evaluated before the proxy's `defaultPrice`. If no route matches
 * and no default price is configured, the proxy returns `404` instead of an
 * L402 challenge because there is no price to charge.
 */
export interface ProxyRoute {
  /**
   * Path matcher.
   *
   * String values support exact matches and trailing `*` prefix globs, such as
   * `/pokemon/*`. Other `*` positions are literal; use `RegExp` for richer
   * segment matching.
   */
  path: string | RegExp;
  /** Allowed HTTP methods. Defaults to all methods. */
  methods?: ProxyHttpMethod[];
  /** Price in millisatoshis, static or resolved per Express request. */
  price: bigint | ((req: ExpressRequest) => bigint | Promise<bigint>);
  /** Optional caveats, static or resolved per Express request. */
  caveats?: ProxyCaveat[];
}

/**
 * Return the first route whose method and path match an Express request.
 *
 * Route order matters. Put more specific routes before broader trailing-star
 * routes when both could match the same request.
 *
 * @param routes - Candidate route policies in evaluation order.
 * @param req - Express request being priced.
 * @returns The first matching route, or `undefined` when none match.
 */
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

/**
 * Test a proxy route path pattern against a request path.
 *
 * String patterns are exact matches unless they end in `*`, in which case the
 * prefix before `*` is matched with `startsWith`. Other `*` positions are
 * literal. Use `RegExp` for richer path-segment matching.
 *
 * @param pattern - Route pattern from `ProxyRoute.path`.
 * @param path - Express request path, such as `/api/items/1`.
 * @returns `true` when the pattern matches the path.
 * @example
 * ```ts
 * isPathMatch("/pokemon/*", "/pokemon/25"); // true
 * isPathMatch("/pokemon/*", "/digimon/25"); // false
 * ```
 */
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
