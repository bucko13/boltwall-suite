import type { ClientRequest } from "node:http";

import type { Request as ExpressRequest } from "express";

const DEFAULT_DENY = ["authorization", "proxy-authorization", "cookie"] as const;

/** Header allow/deny policy applied before forwarding to the upstream. */
export interface ForwardHeadersPolicy {
  /** Optional case-insensitive allow patterns. `*` is supported as a wildcard. */
  allow?: string[];
  /** Optional case-insensitive deny patterns. Defaults still strip credentials and cookies. */
  deny?: string[];
}

export function shouldForwardHeader(name: string, policy: ForwardHeadersPolicy = {}): boolean {
  const normalized = name.toLowerCase();
  const deny = [...DEFAULT_DENY, ...(policy.deny ?? [])];
  if (deny.some((pattern) => matchesHeaderPattern(pattern, normalized))) return false;
  if (policy.allow === undefined) return true;
  return policy.allow.some((pattern) => matchesHeaderPattern(pattern, normalized));
}

export function applyForwardHeaderPolicy(
  proxyReq: ClientRequest,
  req: ExpressRequest,
  policy: ForwardHeadersPolicy = {},
): void {
  for (const name of Object.keys(req.headers)) {
    if (!shouldForwardHeader(name, policy)) {
      proxyReq.removeHeader(name);
    }
  }
}

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
