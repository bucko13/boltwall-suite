import type { ClientRequest } from "node:http";

import type { Request as ExpressRequest } from "express";

const DEFAULT_DENY = ["authorization", "proxy-authorization", "cookie"] as const;

/**
 * Header allow/deny policy applied before forwarding to the upstream.
 *
 * Patterns are case-insensitive globs where `*` can appear anywhere, for
 * example `x-forwarded-*`, `*-token`, or `x-*-id`. Credential-bearing headers
 * are denied even when no custom policy is provided.
 */
export interface ForwardHeadersPolicy {
  /**
   * Optional allow patterns.
   *
   * When present, only matching headers are forwarded after deny rules are
   * applied. Leave unset to forward non-denied headers.
   */
  allow?: string[];
  /**
   * Optional deny patterns.
   *
   * These are added to the default deny list for `Authorization`,
   * `Proxy-Authorization`, and `Cookie`.
   */
  deny?: string[];
}

/**
 * Decide whether a request header should be forwarded upstream.
 *
 * Header names are matched case-insensitively. Deny rules are applied before
 * allow rules, and `Authorization`, `Proxy-Authorization`, and `Cookie` are
 * denied by default to avoid leaking bearer credentials upstream.
 *
 * @param name - Request header name.
 * @param policy - Optional allow and deny glob policy.
 * @returns `true` when the header may be forwarded.
 * @example
 * ```ts
 * shouldForwardHeader("authorization"); // false
 * shouldForwardHeader("x-request-id", { allow: ["x-*"] }); // true
 * ```
 */
export function shouldForwardHeader(name: string, policy: ForwardHeadersPolicy = {}): boolean {
  const normalized = name.toLowerCase();
  const deny = [...DEFAULT_DENY, ...(policy.deny ?? [])];
  if (deny.some((pattern) => matchesHeaderPattern(pattern, normalized))) return false;
  if (policy.allow === undefined) return true;
  return policy.allow.some((pattern) => matchesHeaderPattern(pattern, normalized));
}

/**
 * Remove disallowed request headers from an upstream proxy request.
 *
 * This is called before forwarding protected requests. It strips the proxy's
 * own credential headers unless an application intentionally changes the
 * default policy.
 *
 * @param proxyReq - Outgoing request created by `http-proxy-middleware`.
 * @param req - Incoming Express request.
 * @param policy - Optional allow and deny glob policy.
 */
export function applyForwardHeaderPolicy(
  proxyReq: ClientRequest,
  req: ExpressRequest,
  policy: ForwardHeadersPolicy = {},
): void {
  for (const name of Object.keys(req.headers)) {
    // The Host header is transport-level: `changeOrigin` rewrites it to the
    // upstream host, and HTTP/1.1 requires it. It is not a client header to
    // filter, so the allow/deny policy must never strip it — doing so leaves the
    // forwarded request with no Host, which CDN-fronted upstreams (e.g.
    // Cloudflare) reject with `400 Bad Request`.
    if (name.toLowerCase() === "host") continue;
    if (!shouldForwardHeader(name, policy)) {
      proxyReq.removeHeader(name);
    }
  }
}

// Header patterns use case-insensitive glob matching: `*` is a wildcard that
// can appear anywhere in a pattern and matches any run of characters (for
// example `x-forwarded-*`, `*-token`, or `x-*-id`). This differs from route
// `path` matching in route-matching.ts, which honors only a trailing `*` as a
// prefix and offers RegExp for richer cases. Header names are flat tokens, so a
// positional glob is the natural fit; route paths are hierarchical and get a
// RegExp escape hatch instead.
function matchesHeaderPattern(pattern: string, normalizedName: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern === "*") return true;
  if (!normalizedPattern.includes("*")) return normalizedPattern === normalizedName;

  const escaped = normalizedPattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i").test(normalizedName);
}
