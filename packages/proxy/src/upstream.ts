import type { MinimalLogger } from "@boltwall/middleware/core";
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";

import { applyForwardHeaderPolicy, type ForwardHeadersPolicy } from "./header-policy.js";

interface UpstreamProxyOptions {
  targetUrl: string;
  forwardHeaders?: ForwardHeadersPolicy;
  sanitizeHeaders?: boolean;
  timeoutMs?: number;
  logger: MinimalLogger;
}

/**
 * Create the upstream forwarding handler used by `createProxy`.
 *
 * The handler changes origin headers for the upstream, strips credential-bearing
 * request headers by default, maps upstream 5xx responses and proxy errors to
 * redacted `502` JSON responses, and enforces a request timeout.
 *
 * @param options - Target URL, header policy, timeout, and logger.
 * @returns Express-compatible middleware with `upgrade` support from the proxy.
 */
export function createUpstreamProxy(options: UpstreamProxyOptions) {
  const target = new URL(options.targetUrl);
  const timeout = options.timeoutMs ?? 30_000;

  const proxy = createProxyMiddleware<ExpressRequest, ExpressResponse>({
    target: target.toString(),
    changeOrigin: true,
    xfwd: true,
    proxyTimeout: timeout,
    timeout,
    logger: options.logger,
    selfHandleResponse: true,
    on: {
      proxyReq: (proxyReq, req) => {
        if (options.sanitizeHeaders !== false) {
          applyForwardHeaderPolicy(proxyReq, req, options.forwardHeaders);
        }
      },
      proxyRes: responseInterceptor(async (_buffer, proxyRes, _req, res) => {
        if ((proxyRes.statusCode ?? 0) >= 500) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json");
          return JSON.stringify({ error: "upstream_unavailable" });
        }
        return _buffer;
      }),
      error: (error, _req, res) => {
        options.logger.error(
          { cause: { message: error.message, code: "code" in error ? error.code : undefined } },
          "Boltwall proxy upstream request failed",
        );
        if (!("writeHead" in res) || !("headersSent" in res)) return;
        if (res.writableEnded) return;
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "upstream_unavailable" }));
          return;
        }
        res.end();
      },
    },
  });

  const handler = (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction,
  ): ReturnType<typeof proxy> => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      options.logger.error({ target: target.origin }, "Boltwall proxy upstream request timed out");
      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
        }
        res.end(JSON.stringify({ error: "upstream_unavailable" }));
      }
      req.destroy();
    }, timeout);

    const clearTimer = () => clearTimeout(timer);
    res.once("finish", clearTimer);
    res.once("close", clearTimer);

    return proxy(req, res, (error?: unknown) => {
      clearTimer();
      if (timedOut) return;
      if (error !== undefined) {
        next(error);
        return;
      }
      next();
    });
  };

  handler.upgrade = proxy.upgrade;
  return handler;
}
