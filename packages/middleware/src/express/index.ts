import { assertBackendSupports, type RequiredBackendCapabilities } from "@boltwall/adapters";
import {
  expirationSatisfier,
  ipCaveat,
  ipSatisfier,
  originCaveat,
  originSatisfier,
  routeCaveat,
  routeSatisfier,
  validUntil,
  validUntilSatisfier,
} from "@boltwall/l402";
import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";

import { authorizeL402 } from "../core/authorize.js";
import type { L402Config } from "../core/types.js";
import { defaultLogger } from "../logger.js";

import { expressRequestToWebRequest } from "./translate.js";
import "./types.js";

// Caveat factory re-exports for ergonomic middleware config.
export { ipCaveat, originCaveat, routeCaveat, validUntil };

/**
 * Express middleware options.
 *
 * Extends the framework-neutral `L402Config` with optional backend capability
 * requirements checked when `boltwall()` is created.
 */
export type L402ExpressOptions = L402Config & RequiredBackendCapabilities;

/**
 * Drop-in time caveat preset for Express middleware.
 *
 * Adds a `valid-until` caveat to newly minted challenges at a default rate of
 * one satoshi per second, and verifies both modern `valid-until` and legacy
 * `expiration` caveats. The
 * [L402 macaroon spec](https://github.com/lightninglabs/L402/blob/master/macaroon-spec.md)
 * §Caveat Format and §Verification govern the caveat serialization and
 * satisfier checks.
 *
 * @example
 * ```ts
 * app.use("/paid", boltwall({ ...baseConfig, ...TIME_CAVEAT_CONFIG }));
 * ```
 */
export const TIME_CAVEAT_CONFIG: Partial<L402ExpressOptions> = {
  rate: 1,
  satisfiers: [validUntilSatisfier(), expirationSatisfier()],
};

/**
 * Drop-in HTTP Origin caveat preset for Express middleware.
 *
 * Binds freshly minted challenges to the incoming `Origin` header and verifies
 * credentials against that request metadata. Deployments should only rely on
 * this when their origin policy is meaningful for the protected route.
 *
 * @example
 * ```ts
 * app.use("/browser-only", boltwall({ ...baseConfig, ...ORIGIN_CAVEAT_CONFIG }));
 * ```
 */
export const ORIGIN_CAVEAT_CONFIG: Partial<L402ExpressOptions> = {
  caveats: [(req) => originCaveat(req.headers.get("origin") ?? "")],
  satisfiers: [originSatisfier("any")],
};

/**
 * Drop-in client IP caveat preset for Express middleware.
 *
 * Binds freshly minted challenges to the translated request IP
 * (`X-Forwarded-For`, populated from `req.ip` when absent) and verifies legacy
 * `ip=<client-ip>` credentials. Trust this only behind a configured proxy
 * policy that controls forwarded client IP metadata.
 *
 * @example
 * ```ts
 * app.use("/paid", boltwall({ ...baseConfig, ...IP_CAVEAT_CONFIG }));
 * ```
 */
export const IP_CAVEAT_CONFIG: Partial<L402ExpressOptions> = {
  caveats: [(req) => ipCaveat(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "")],
  satisfiers: [ipSatisfier()],
};

/**
 * Drop-in route caveat preset for Express middleware.
 *
 * Binds freshly minted challenges to the current request pathname. The wildcard
 * route satisfier policy allows the caveat value itself to constrain the
 * credential to that path.
 *
 * @example
 * ```ts
 * app.use("/api", boltwall({ ...baseConfig, ...ROUTE_CAVEAT_CONFIG }));
 * ```
 */
export const ROUTE_CAVEAT_CONFIG: Partial<L402ExpressOptions> = {
  caveats: [(req) => routeCaveat(new URL(req.url).pathname)],
  satisfiers: [routeSatisfier(["*"])],
};

/**
 * Express middleware factory for L402 payment authentication.
 *
 * Returns a middleware function that:
 * - Translates the Express request to a Web Fetch Request.
 * - Calls `authorizeL402(request, config)`.
 * - On success, attaches the L402 context to `req.l402` and calls `next()`.
 * - On failure, copies the 402/401/400/502 response and ends the request.
 *
 * Compatible with Express 4 and Express 5:
 * - Express 5 supports promise-returning middleware natively.
 * - Express 4 does not; any thrown errors are forwarded to next(err).
 *
 * [L402 protocol specification](https://github.com/lightninglabs/L402/blob/master/protocol-specification.md)
 * §5 and §10: status codes and challenge headers are handled by authorizeL402;
 * this adapter only translates the layer.
 *
 * @param options - L402 config plus optional required backend capabilities.
 *
 * @example
 * ```ts
 * import express from "express";
 * import { boltwall } from "@boltwall/middleware/express";
 *
 * const app = express();
 * app.use("/paid", boltwall(config));
 * app.get("/paid", (req, res) => {
 *   res.json({ paymentHash: req.l402.paymentHash });
 * });
 * ```
 */
export function boltwall(
  options: L402ExpressOptions,
): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void {
  // Fail at construction time if the backend lacks a required capability.
  assertBackendSupports(options.backend, options);

  const config: L402Config = {
    ...options,
    logger: options.logger ?? defaultLogger,
  };

  return function boltwallMiddleware(
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction,
  ) {
    const webRequest = expressRequestToWebRequest(req);

    authorizeL402(webRequest, config)
      .then((result) => {
        if (result.ok) {
          req.l402 = result.context;
          next();
          return;
        }

        // Copy status and headers from the Web Response to the Express response.
        res.status(result.response.status);
        result.response.headers.forEach((value, key) => {
          res.append(key, value);
        });
        res.end();
      })
      .catch((err: unknown) => {
        // Forward unexpected errors to Express error handlers (Express 4 compat).
        next(err instanceof Error ? err : new Error(String(err)));
      });
  };
}
