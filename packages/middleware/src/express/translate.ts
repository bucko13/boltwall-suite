import type { Request as ExpressRequest } from "express";

/**
 * Translate an Express request to a Web Fetch Request for authorizeL402.
 *
 * Standard L402 decisions are header-driven. HODL invoice creation also needs
 * `paymentHash` from a parsed JSON body when callers use POST-style challenge
 * requests, so parsed `req.body` is serialized into the Fetch request when
 * present.
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

  if (!headers.has("x-forwarded-for") && req.ip !== undefined) {
    headers.set("x-forwarded-for", req.ip);
  }

  const init: RequestInit = { method: req.method, headers };
  const body = (req as ExpressRequest & { body?: unknown }).body;
  if (req.method !== "GET" && req.method !== "HEAD" && body !== undefined && body !== null) {
    if (typeof body === "string" || body instanceof Uint8Array) {
      init.body = body;
    } else {
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      init.body = JSON.stringify(body);
    }
  }

  return new Request(url, init);
}
