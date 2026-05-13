import type { Request as ExpressRequest } from "express";

/**
 * Translate an Express request to a Web Fetch Request for authorizeL402.
 *
 * For L402 gating, the middleware runs before the handler reads the body,
 * so we only need the URL and headers. Body translation is omitted
 * intentionally — L402 decisions are header-driven.
 */
export function expressRequestToWebRequest(req: ExpressRequest): Request {
  const protocol = req.protocol ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = `${protocol}://${host}${req.originalUrl ?? req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  return new Request(url, { method: req.method, headers });
}
