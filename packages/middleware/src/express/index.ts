import type { NextFunction, Request as ExpressRequest, Response as ExpressResponse } from "express";

import { expirationCaveat } from "@boltwall/l402";

import { authorizeL402 } from "../core/authorize.js";
import type { L402Config } from "../core/types.js";
import { defaultLogger } from "../logger.js";
import { expressRequestToWebRequest } from "./translate.js";
import "./types.js";

// Common caveat factory re-export.
export { expirationCaveat as validUntil };

export type L402ExpressOptions = L402Config;

/**
 * Express middleware factory for L402 payment authentication.
 *
 * Returns a middleware function that:
 * - Translates the Express request to a Web Fetch Request.
 * - Calls authorizeL402(request, config).
 * - On success: attaches the L402 context to req.l402 and calls next().
 * - On failure: copies the 402/401/502 response to the Express response and ends.
 *
 * Compatible with Express 4 and Express 5:
 * - Express 5 supports promise-returning middleware natively.
 * - Express 4 does not; any thrown errors are forwarded to next(err).
 *
 * L402 protocol-specification.md §5, §10 — status codes and challenge headers
 * are handled by authorizeL402; this adapter only translates the layer.
 */
export function boltwall(
  options: L402ExpressOptions,
): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => void {
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

    authorizeL402(webRequest, config).then((result) => {
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
    }).catch((err: unknown) => {
      // Forward unexpected errors to Express error handlers (Express 4 compat).
      next(err instanceof Error ? err : new Error(String(err)));
    });
  };
}
