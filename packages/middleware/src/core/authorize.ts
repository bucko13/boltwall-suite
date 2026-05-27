/**
 * authorizeL402 — framework-agnostic L402 authentication gate.
 *
 * Spec citations:
 *   L402 protocol-specification.md §5  — 402 is ONLY for the initial
 *     missing-credential challenge. Present-but-invalid credentials → 401.
 *   L402 protocol-specification.md §10 — dual LSAT-first/L402-second
 *     WWW-Authenticate headers for backwards compatibility (default).
 *   L402 macaroon-spec.md §Verification — HMAC chain integrity check.
 *   AGENTS.md security-boundaries — invoice amount MUST be verified.
 */

import type { InvoiceLookup } from "@boltwall/adapters";
import { bytesToHex, hexToBytes } from "@boltwall/internal";
import { msatsToSats } from "@boltwall/internal/numeric";
import {
  type Caveat,
  type L402CredentialFields,
  type MacaroonIdentifierV0,
  VerificationFailurePrefix,
  VerificationFailureReason,
  buildAuthenticateHeaders,
  capabilitiesCaveat,
  decodeIdentifier,
  mintMacaroon,
  parseAuthorizationHeader,
  servicesCaveat,
  validUntil,
  verifyMacaroon,
} from "@boltwall/l402";

import { noopLogger } from "../logger.js";

import { L402Error, l402ErrorToStatus, type L402ErrorKind } from "./error.js";
import type { L402Config, L402GateResult, L402RequestContext } from "./types.js";

const PAYMENT_HASH_HEX_RE = /^[0-9a-fA-F]{64}$/;

/** Cryptographically random 32-byte token id. */
function randomTokenId(): Uint8Array {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Resolve a price value that may be static or a per-request function. */
async function resolvePrice(price: L402Config["price"], req: Request): Promise<bigint> {
  return typeof price === "function" ? price(req) : price;
}

/** Resolve and collect all caveats for this request. */
async function resolveCaveats(
  config: L402Config,
  req: Request,
  amountMsat: bigint,
): Promise<Caveat[]> {
  const out: Caveat[] = [];

  const service = config.service;
  if (service !== undefined) {
    out.push(servicesCaveat([{ name: service, tier: 0 }]));
  }
  if (config.capabilities !== undefined) {
    if (service === undefined) {
      throw new Error("capabilities-require-service");
    }
    out.push(capabilitiesCaveat(service, config.capabilities));
  }

  for (const c of config.caveats ?? []) {
    out.push(typeof c === "function" ? await c(req) : c);
  }
  if (config.rate !== undefined) {
    out.push(rateCaveat(amountMsat, config.rate));
  }
  return orderValidUntilCaveats(out);
}

/**
 * Build a dynamic time caveat from the paid amount.
 *
 * L402 macaroon-spec.md §Caveat Format — the generated caveat is serialized as
 * the standard `valid-until=<ISO>` first-party caveat.
 */
function rateCaveat(amountMsat: bigint, rate: number): Caveat {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("invalid-rate");
  }
  const sats = Number(msatsToSats(amountMsat).sats);
  return validUntil({ seconds: Math.ceil(sats / rate) });
}

function orderValidUntilCaveats(caveats: Caveat[]): Caveat[] {
  const sortedValidUntil = caveats
    .filter((caveat) => caveat.condition === "valid-until")
    .sort((a, b) => Date.parse(b.value) - Date.parse(a.value));

  return caveats.map((caveat) =>
    caveat.condition === "valid-until" ? sortedValidUntil.shift()! : caveat,
  );
}

/**
 * Map a verifyMacaroon failure reason to an L402ErrorKind.
 * L402 protocol-specification.md §6 Authorization — 401 for all present-
 * but-invalid-credential cases.
 */
function verifyReasonToKind(
  reason: string,
): "invalid-credential" | "invalid-preimage" | "caveat-rejected" {
  if (reason === VerificationFailureReason.PreimageMismatch) return "invalid-preimage";
  if (reason.startsWith(VerificationFailurePrefix.CaveatRejected)) return "caveat-rejected";
  return "invalid-credential";
}

function errorResult(kind: L402ErrorKind, message: string): L402GateResult {
  const error = new L402Error(kind, message);
  return {
    ok: false,
    response: new Response(null, { status: l402ErrorToStatus(error.kind) }),
    error,
  };
}

function normalizePaymentHash(value: string): string | undefined {
  return PAYMENT_HASH_HEX_RE.test(value) ? value.toLowerCase() : undefined;
}

async function extractHodlPaymentHash(req: Request): Promise<string | undefined> {
  const fromQuery = new URL(req.url).searchParams.get("paymentHash");
  if (fromQuery !== null) {
    return normalizePaymentHash(fromQuery);
  }

  if (req.method === "GET" || req.method === "HEAD" || req.body === null) {
    return undefined;
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return undefined;
  }

  let body: unknown;
  try {
    body = await req.clone().json();
  } catch {
    return undefined;
  }

  if (typeof body !== "object" || body === null || !("paymentHash" in body)) {
    return undefined;
  }

  const paymentHash = (body as { paymentHash?: unknown }).paymentHash;
  return typeof paymentHash === "string" ? normalizePaymentHash(paymentHash) : undefined;
}

async function requireAmountMatch(
  config: L402Config,
  request: Request,
  lookup: InvoiceLookup,
  logger: L402Config["logger"],
): Promise<L402GateResult | undefined> {
  const expectedPrice = await resolvePrice(config.price, request);
  const actualAmount = lookup.amountMsat;
  if (actualAmount === undefined || actualAmount !== expectedPrice) {
    logger?.warn(
      { expected: expectedPrice.toString(), actual: actualAmount?.toString() ?? "undefined" },
      "L402 amount mismatch",
    );
    return errorResult(
      "invalid-credential",
      `Amount mismatch: expected ${expectedPrice} msat, got ${actualAmount ?? "unknown"} msat`,
    );
  }
  return undefined;
}

async function verifyCredential(
  config: L402Config,
  request: Request,
  credential: L402CredentialFields,
  requirePreimage: boolean,
  logger: L402Config["logger"],
): Promise<L402GateResult | undefined> {
  const preimage = credential.preimage.length === 0 ? undefined : credential.preimage;
  const verifyResult = await verifyMacaroon({
    macaroons: credential.macaroons,
    rootKeyStore: config.rootKeyStore,
    satisfiers: config.satisfiers ?? [],
    context: { request, now: new Date() },
    requirePreimage,
    ...(preimage === undefined ? {} : { preimage }),
  });

  if (!verifyResult.ok) {
    const kind = verifyReasonToKind(verifyResult.reason);
    logger?.info({ reason: verifyResult.reason }, `L402 verification failed: ${kind}`);
    return errorResult(kind, verifyResult.reason);
  }
  return undefined;
}

async function authorizeSuccess(
  config: L402Config,
  request: Request,
  credential: L402CredentialFields,
  paymentHashHex: string,
  identifier: MacaroonIdentifierV0,
  logger: L402Config["logger"],
): Promise<L402GateResult> {
  const context: L402RequestContext = {
    paymentHash: paymentHashHex,
    identifier,
  };

  if (config.onPaid) {
    await config.onPaid({ credential, req: request });
  }

  logger?.info({ paymentHash: paymentHashHex }, "L402 authorization granted");

  return { ok: true, context };
}

/**
 * Emit a 402 Payment Required response with a fresh invoice + macaroon.
 *
 * L402 protocol-specification.md §5 — 402 is ONLY for absent credentials.
 * L402 protocol-specification.md §10 — dual LSAT-first/L402-second by default.
 */
async function emitChallenge(
  config: L402Config,
  req: Request,
  logger: L402Config["logger"],
): Promise<L402GateResult> {
  const log = logger ?? noopLogger;

  let invoice;
  let amountMsat: bigint;
  try {
    amountMsat = await resolvePrice(config.price, req);
    const description = config.invoiceMemo ? config.invoiceMemo(req) : config.service;
    const invoiceRequest = {
      amountMsat,
      ...(description === undefined ? {} : { description }),
    };
    if (config.hodl === true) {
      const paymentHash = await extractHodlPaymentHash(req);
      if (paymentHash === undefined) {
        return errorResult("bad-request", "HODL requests must include a 32-byte hex paymentHash");
      }
      invoice = await config.backend.createInvoice({
        ...invoiceRequest,
        hodl: true,
        paymentHash,
      });
    } else {
      invoice = await config.backend.createInvoice(invoiceRequest);
    }
  } catch (cause) {
    log.warn({ cause }, "L402 backend failed to create invoice");
    const error = new L402Error("invoice-provider-failure", "Lightning backend error", { cause });
    return {
      ok: false,
      response: new Response(null, { status: l402ErrorToStatus(error.kind) }),
      error,
    };
  }

  const paymentHash = hexToBytes(invoice.paymentHash);
  const tokenId = randomTokenId();
  const caveats = await resolveCaveats(config, req, amountMsat);

  const macaroon = mintMacaroon({
    rootKey: await getOrGenerateRootKey(tokenId, config.rootKeyStore),
    identifier: { version: 0, paymentHash, tokenId },
    caveats,
  });

  const wwwAuth = buildAuthenticateHeaders({
    macaroon,
    invoice: invoice.paymentRequest,
    compatibility: config.challengeCompatibility ?? "dual",
  });

  // buildAuthenticateHeaders returns string[] — each element is a full
  // WWW-Authenticate header value. Append each as a separate header line.
  const headers = new Headers();
  for (const value of wwwAuth) {
    headers.append("WWW-Authenticate", value);
  }

  const headersRecord: Record<string, string[]> = { "WWW-Authenticate": wwwAuth };
  const error = new L402Error("payment-required", "L402 payment required", {
    headers: headersRecord,
  });

  return {
    ok: false,
    response: new Response(null, { status: 402, headers }),
    error,
  };
}

/** Get an existing root key or generate and store a fresh one. */
async function getOrGenerateRootKey(
  tokenId: Uint8Array,
  store: L402Config["rootKeyStore"],
): Promise<Uint8Array> {
  const existing = await store.get(tokenId);
  if (existing) return existing;
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  await store.put(tokenId, key);
  return key;
}

/**
 * Authorize an incoming L402-protected request.
 *
 * Returns { ok: true, context } when the credential is valid and payment
 * is confirmed. Returns { ok: false, response, error } when a 402 or 401
 * response must be sent to the client.
 *
 * Security invariants (per AGENTS.md and L402 spec):
 *   - 402 is emitted ONLY when the Authorization header is absent or carries
 *     a non-L402/LSAT scheme. L402 protocol-specification.md §5.
 *   - Invoice amount MUST match config.price. Amount mismatch is treated as
 *     invalid-credential (401). AGENTS.md security-boundaries.
 *   - Constant-time comparisons are handled inside verifyMacaroon /
 *     verifyPreimage upstream; this function does not compare secrets directly.
 *
 * @param request - Web Fetch Request object.
 * @param config  - L402 middleware configuration.
 */
export async function authorizeL402(request: Request, config: L402Config): Promise<L402GateResult> {
  const log = config.logger ?? noopLogger;

  // Warn if TLS appears absent — deployers are responsible for TLS, but
  // we surface an obvious mistake loudly.
  if (request.url.startsWith("http://")) {
    log.warn(
      { url: request.url },
      "L402 middleware handling a non-TLS request — production deployments must use HTTPS",
    );
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const scheme = authHeader.split(" ")[0]?.toUpperCase() ?? "";

  // L402 protocol-specification.md §5 — absent or non-L402/LSAT credential
  // triggers a 402 challenge. "Bearer" and other schemes are treated as absent.
  if (!authHeader || (scheme !== "L402" && scheme !== "LSAT")) {
    return emitChallenge(config, request, log);
  }

  // --- Credential is present. All failures below → 401. ---

  // Parse the Authorization header.
  let credential: L402CredentialFields;
  try {
    credential = parseAuthorizationHeader(authHeader, {
      allowEmptyPreimage: config.hodl === true,
    });
  } catch {
    const error = new L402Error("invalid-credential", "Malformed Authorization header");
    return {
      ok: false,
      response: new Response(null, { status: 401 }),
      error,
    };
  }

  // Extract payment hash from the FIRST macaroon identifier.
  let identifier: MacaroonIdentifierV0;
  try {
    identifier = decodeIdentifier(credential.macaroons[0]!);
  } catch {
    const error = new L402Error("invalid-credential", "Undecodable macaroon identifier");
    return {
      ok: false,
      response: new Response(null, { status: 401 }),
      error,
    };
  }

  const paymentHashHex = bytesToHex(identifier.paymentHash);

  // Look up the invoice to confirm payment status.
  let lookup: InvoiceLookup;
  try {
    lookup = await config.backend.lookupInvoice(paymentHashHex);
  } catch (cause) {
    log.warn({ cause }, "L402 backend failed to look up invoice");
    const error = new L402Error("invoice-provider-failure", "Backend lookup failed", { cause });
    return {
      ok: false,
      response: new Response(null, { status: l402ErrorToStatus(error.kind) }),
      error,
    };
  }

  // Invoice still unpaid → re-challenge. The spec says to use the SAME invoice,
  // but since InvoiceLookup doesn't carry paymentRequest, we issue a fresh
  // challenge. This is a known v0.1.0 limitation; a persistent challenge cache
  // can restore exact idempotency later.
  if (lookup.status === "open") {
    return emitChallenge(config, request, log);
  }

  // Invoice expired or cancelled → treat as missing credential.
  if (lookup.status === "expired" || lookup.status === "canceled") {
    return emitChallenge(config, request, log);
  }

  if (lookup.status === "held") {
    if (config.hodl !== true) {
      return emitChallenge(config, request, log);
    }

    const amountError = await requireAmountMatch(config, request, lookup, log);
    if (amountError !== undefined) return amountError;

    const hasPreimage = credential.preimage.length > 0;
    const verifyError = await verifyCredential(config, request, credential, hasPreimage, log);
    if (verifyError !== undefined) return verifyError;

    if (hasPreimage) {
      if (config.backend.settleHodlInvoice === undefined) {
        return errorResult(
          "invoice-provider-failure",
          "Lightning backend cannot settle HODL invoices",
        );
      }
      try {
        await config.backend.settleHodlInvoice(credential.preimage);
      } catch (cause) {
        log.warn({ cause }, "L402 backend failed to settle HODL invoice");
        const error = new L402Error("invoice-provider-failure", "Backend HODL settlement failed", {
          cause,
        });
        return {
          ok: false,
          response: new Response(null, { status: l402ErrorToStatus(error.kind) }),
          error,
        };
      }
    }

    return authorizeSuccess(config, request, credential, paymentHashHex, identifier, log);
  }

  if (lookup.status === "settled" && config.hodl === true) {
    return errorResult("invalid-credential", "HODL credential expired after settlement");
  }

  const verifyError = await verifyCredential(config, request, credential, true, log);
  if (verifyError !== undefined) return verifyError;

  // Security: verify invoice amount matches configured price.
  // AGENTS.md security-boundaries — middleware MUST verify the bolt11 amount
  // matches the configured price. Skipping this is an auth-bypass.
  const amountError = await requireAmountMatch(config, request, lookup, log);
  if (amountError !== undefined) return amountError;

  return authorizeSuccess(config, request, credential, paymentHashHex, identifier, log);
}
