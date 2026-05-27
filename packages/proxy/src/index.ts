import type { LightningBackend } from "@boltwall/adapters";
import type { L402Config, MinimalLogger } from "@boltwall/middleware/core";
import { boltwall, type L402ExpressOptions } from "@boltwall/middleware/express";
import express, {
  type Express,
  type NextFunction,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";

import type { ForwardHeadersPolicy } from "./header-policy.js";
import {
  findMatchingRoute,
  isPathMatch,
  type ProxyCaveat,
  type ProxyRoute,
} from "./route-matching.js";
import { createUpstreamProxy } from "./upstream.js";

export type { ForwardHeadersPolicy } from "./header-policy.js";
export { loadProxyEnv, type LoadProxyEnvOptions, type ProxyEnvConfig } from "./env.js";
export type { ProxyRoute } from "./route-matching.js";

/** Opt-in CORS policy for browser clients that need to inspect L402 challenges. */
export interface ProxyCorsConfig {
  /** Exact browser origins allowed to read proxy responses. Wildcards are intentionally unsupported. */
  allowOrigins: string[];
  /** Response headers exposed to browser JavaScript. Defaults to `WWW-Authenticate`. */
  exposeHeaders?: string[];
  /** Request headers allowed on CORS preflight. Defaults to common L402 demo headers. */
  allowHeaders?: string[];
  /** Methods allowed on CORS preflight. Defaults to `GET`, `HEAD`, and `OPTIONS`. */
  allowMethods?: string[];
  /** Optional `Access-Control-Max-Age` value in seconds for preflight caching. */
  maxAgeSeconds?: number;
}

/** Runtime configuration for the Express-based Boltwall reverse proxy. */
export interface ProxyConfig extends Pick<
  L402ExpressOptions,
  | "rate"
  | "caveats"
  | "satisfiers"
  | "onPaid"
  | "hodl"
  | "cancelInvoice"
  | "streamingInvoices"
  | "customDescription"
> {
  /** Upstream HTTP origin receiving requests after L402 authorization. */
  targetUrl: string;
  /** Lightning backend used by the underlying L402 middleware. */
  backend: LightningBackend;
  /** Server-side root-key store used to mint and verify macaroons. */
  rootKeyStore: L402Config["rootKeyStore"];
  /** Optional service name for minted macaroon service caveats. Defaults to the target host. */
  service?: string;
  /** Protected route pricing and caveat rules, evaluated before `defaultPrice`. */
  routes?: ProxyRoute[];
  /** Price in millisatoshis for protected requests that do not match a route. */
  defaultPrice?: bigint;
  /** Macaroon capabilities appended to minted challenges. */
  capabilities?: L402Config["capabilities"];
  /** Optional human-readable invoice memo resolved from the incoming Express request. */
  invoiceMemo?: (req: ExpressRequest) => string;
  /** Paths that bypass L402 and proxy directly to the upstream. */
  unprotectedPaths?: (string | RegExp)[];
  /** Header forwarding policy. Credentials and cookies are denied by default. */
  forwardHeaders?: ForwardHeadersPolicy;
  /** Optional CORS policy for browser clients. Disabled by default. */
  cors?: ProxyCorsConfig;
  /** Timeout applied to upstream proxy requests. */
  upstreamTimeoutMs?: number;
  /**
   * Challenge output mode.
   *
   * L402 protocol-specification.md §10 recommends dual LSAT-first/L402-second
   * challenges for backwards compatibility. This proxy delegates emission to
   * `@boltwall/middleware`.
   */
  challengeCompatibility?: L402Config["challengeCompatibility"];
  /** Optional structured logger. Defaults to `console`. */
  logger?: MinimalLogger;
}

/**
 * Create an Express reverse proxy protected by L402 payment middleware.
 *
 * The proxy chooses a per-request price/caveat policy, delegates challenge and
 * credential verification to `@boltwall/middleware`, then forwards authorized
 * requests to `targetUrl` through `http-proxy-middleware`.
 */
export function createProxy(config: ProxyConfig): Express {
  const target = new URL(config.targetUrl);
  const logger = config.logger ?? console;
  const service = config.service ?? target.host;
  const protectedUpstream = createUpstreamProxy({
    targetUrl: target.toString(),
    logger,
    ...(config.forwardHeaders === undefined ? {} : { forwardHeaders: config.forwardHeaders }),
    ...(config.upstreamTimeoutMs === undefined ? {} : { timeoutMs: config.upstreamTimeoutMs }),
  });
  const passthroughUpstream = createUpstreamProxy({
    targetUrl: target.toString(),
    logger,
    sanitizeHeaders: false,
    ...(config.upstreamTimeoutMs === undefined ? {} : { timeoutMs: config.upstreamTimeoutMs }),
  });
  const app = express();

  if (target.protocol === "http:") {
    logger.warn(
      { target: target.origin },
      "Boltwall proxy forwarding to a non-TLS upstream; production deployments should use HTTPS",
    );
  }

  app.use((req, res, next) => {
    const corsAllowed = applyCorsHeaders(req, res, config.cors);
    if (config.cors !== undefined && req.method === "OPTIONS") {
      res.status(corsAllowed ? 204 : 403).end();
      return;
    }

    if (isUnprotected(req, config.unprotectedPaths)) {
      void passthroughUpstream(req, res, next);
      return;
    }

    const route = findMatchingRoute(config.routes ?? [], req);
    if (route === undefined && config.defaultPrice === undefined) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    const price = route?.price ?? config.defaultPrice!;
    const caveats = mergeCaveats(config.caveats, wrapRouteCaveats(route?.caveats, req));
    const middleware = boltwall({
      service,
      backend: config.backend,
      rootKeyStore: config.rootKeyStore,
      price: typeof price === "function" ? () => price(req) : price,
      ...(caveats === undefined ? {} : { caveats }),
      ...(config.rate === undefined ? {} : { rate: config.rate }),
      ...(config.capabilities === undefined ? {} : { capabilities: config.capabilities }),
      ...(config.invoiceMemo === undefined ? {} : { invoiceMemo: () => config.invoiceMemo!(req) }),
      ...(config.satisfiers === undefined ? {} : { satisfiers: config.satisfiers }),
      ...(config.onPaid === undefined ? {} : { onPaid: config.onPaid }),
      ...(config.challengeCompatibility === undefined
        ? {}
        : { challengeCompatibility: config.challengeCompatibility }),
      ...(config.hodl === undefined ? {} : { hodl: config.hodl }),
      ...(config.cancelInvoice === undefined ? {} : { cancelInvoice: config.cancelInvoice }),
      ...(config.streamingInvoices === undefined
        ? {}
        : { streamingInvoices: config.streamingInvoices }),
      ...(config.customDescription === undefined
        ? {}
        : { customDescription: config.customDescription }),
      logger,
    });

    middleware(req, res, (err?: unknown) => {
      if (err !== undefined) {
        next(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      void protectedUpstream(req, res, next);
    });
  });

  return app;
}

const DEFAULT_CORS_EXPOSE_HEADERS = ["WWW-Authenticate"] as const;
const DEFAULT_CORS_ALLOW_HEADERS = ["Authorization", "Content-Type", "Accept"] as const;
const DEFAULT_CORS_ALLOW_METHODS = ["GET", "HEAD", "OPTIONS"] as const;

function applyCorsHeaders(
  req: ExpressRequest,
  res: ExpressResponse,
  cors: ProxyCorsConfig | undefined,
): boolean {
  if (cors === undefined) return false;

  const origin = req.get("origin");
  if (origin === undefined || !cors.allowOrigins.includes(origin)) return false;

  res.vary("Origin");
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader(
    "Access-Control-Expose-Headers",
    listHeader(cors.exposeHeaders ?? DEFAULT_CORS_EXPOSE_HEADERS),
  );

  if (req.method === "OPTIONS") {
    res.setHeader(
      "Access-Control-Allow-Methods",
      listHeader(cors.allowMethods ?? DEFAULT_CORS_ALLOW_METHODS),
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      listHeader(cors.allowHeaders ?? DEFAULT_CORS_ALLOW_HEADERS),
    );
    if (cors.maxAgeSeconds !== undefined) {
      res.setHeader("Access-Control-Max-Age", String(cors.maxAgeSeconds));
    }
  }

  return true;
}

function listHeader(values: readonly string[]): string {
  return values.join(", ");
}

function isUnprotected(req: ExpressRequest, patterns: (string | RegExp)[] = []): boolean {
  return patterns.some((pattern) => isPathMatch(pattern, req.path));
}

function mergeCaveats(
  globalCaveats: L402Config["caveats"] | undefined,
  routeCaveats: L402Config["caveats"] | undefined,
): L402Config["caveats"] | undefined {
  const caveats = [...(globalCaveats ?? []), ...(routeCaveats ?? [])];
  return caveats.length === 0 ? undefined : caveats;
}

function wrapRouteCaveats(
  caveats: ProxyCaveat[] | undefined,
  req: ExpressRequest,
): L402Config["caveats"] | undefined {
  if (caveats === undefined || caveats.length === 0) return undefined;

  return caveats.map((caveat) => {
    if (typeof caveat !== "function") return caveat;
    return () => caveat(req);
  });
}
