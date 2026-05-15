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

/** Runtime configuration for the Express-based Boltwall reverse proxy. */
export interface ProxyConfig
  extends Pick<
    L402ExpressOptions,
    | "rate"
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
    const caveats = wrapCaveats(route?.caveats, req);
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

function isUnprotected(req: ExpressRequest, patterns: (string | RegExp)[] = []): boolean {
  return patterns.some((pattern) => isPathMatch(pattern, req.path));
}

function wrapCaveats(
  caveats: ProxyCaveat[] | undefined,
  req: ExpressRequest,
): L402Config["caveats"] | undefined {
  if (caveats === undefined) return undefined;

  return caveats.map((caveat) => {
    if (typeof caveat !== "function") return caveat;
    return () => caveat(req);
  });
}
