/**
 * Client-side orchestration helpers for the L402 challenge → pay → retry
 * flow. Pure orchestration — no React, no WebLN coupling.
 *
 * UI layers compose these in two stages so the user can pay asynchronously
 * between the challenge and the retry:
 *
 * 1. `fetchPaidResource(url, init)` issues the initial request and, on 402,
 *    returns the parsed challenge fields. On 200 it returns the response
 *    directly.
 * 2. `retryWithCredential(url, init, challenge, preimage)` builds the L402
 *    `Authorization` header from the challenge + preimage and retries.
 *
 * Wire-format work delegated to `@boltwall/l402`:
 * - `parseAuthenticateHeader` handles dual LSAT-first/L402-second
 *   challenges (L402 protocol-specification.md §10).
 * - `buildAuthorizationHeader` formats the `macaroon:preimage` credential
 *   and prefixes the correct scheme keyword.
 */

import {
  buildAuthorizationHeader,
  parseAuthenticateHeader,
  parseAuthorizationHeader,
  type L402ChallengeFields,
} from "@boltwall/l402";

/**
 * 32 bytes encoded as hex.
 */
const PREIMAGE_HEX_LENGTH = 64;
const HEX_RE = /^[0-9a-fA-F]+$/;

/**
 * Outcome of the initial `fetchPaidResource` call.
 *
 * - `status: "ok"` when the server returned 200 — no payment was required.
 * - `status: "challenge"` when the server returned 402 with a parseable
 *   `WWW-Authenticate` header. Callers should prompt the user, acquire a
 *   preimage, then call `retryWithCredential`.
 * - `status: "error"` for every other non-2xx response. The HTTP `response`
 *   is surfaced so callers can render the server's error message.
 */
export type FetchPaidResult =
  | { status: "ok"; response: Response }
  | { status: "challenge"; challenge: L402ChallengeFields }
  | { status: "error"; response: Response };

export type PaidCredential = {
  authorization: string;
  scheme: "L402" | "LSAT";
  macaroon: string;
  macaroons: string[];
  preimage: string;
};

export type FetchPaidDiagnostic =
  | {
      kind: "request-failed-before-readable-response";
      message: string;
    }
  | {
      kind: "payment-challenge-missing";
      status: 402;
    }
  | {
      kind: "payment-challenge-invalid";
      status: 402;
      message: string;
    };

export class FetchPaidResourceError extends Error {
  readonly diagnostic: FetchPaidDiagnostic;
  override readonly cause?: unknown;

  constructor(diagnostic: FetchPaidDiagnostic, options: { cause?: unknown } = {}) {
    super(diagnostic.kind);
    this.name = "FetchPaidResourceError";
    this.diagnostic = diagnostic;
    this.cause = options.cause;
  }
}

/**
 * Outcome of `retryWithCredential`.
 *
 * - `status: "paid"` when the post-payment retry returned 2xx.
 * - `status: "rejected"` when the retry returned non-2xx (e.g. tampered
 *   credential → 401). The HTTP `response` is surfaced.
 */
export type RetryResult =
  | { status: "paid"; response: Response; credential: PaidCredential }
  | { status: "rejected"; response: Response; credential: PaidCredential };

/**
 * Issue the initial request. On 402, parse the challenge so the caller can
 * trigger a wallet payment without seeing the raw header.
 *
 * @throws when a 402 response is missing `WWW-Authenticate` or the header
 *   is malformed.
 */
export async function fetchPaidResource(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<FetchPaidResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new FetchPaidResourceError(
      {
        kind: "request-failed-before-readable-response",
        message: error instanceof Error ? error.message : String(error),
      },
      { cause: error },
    );
  }
  if (response.status !== 402) {
    return response.ok ? { status: "ok", response } : { status: "error", response };
  }
  const challenge = pickChallenge(response.headers);
  return { status: "challenge", challenge };
}

/**
 * Retry the same request with an L402 `Authorization` header built from the
 * challenge macaroon and a paid preimage.
 *
 * Uses the `LSAT` scheme keyword when only an `LSAT` challenge was offered;
 * otherwise emits `L402` per the spec's dual-challenge convention.
 *
 * @throws when `preimage` is not a 32-byte hex string.
 */
export async function retryWithCredential(
  url: string,
  init: RequestInit,
  challenge: L402ChallengeFields,
  preimage: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<RetryResult> {
  const credential = buildPaidCredential(challenge, preimage);
  const response = await fetchImpl(url, withAuthorization(init, credential));
  return response.ok
    ? { status: "paid", response, credential }
    : { status: "rejected", response, credential };
}

/**
 * Build a reusable L402 credential from a challenge and paid preimage.
 *
 * Per L402 protocol-specification.md §8, clients should cache and reuse
 * credentials until rejected by the server.
 *
 * @throws when `preimage` is not a 32-byte hex string.
 */
export function buildPaidCredential(
  challenge: Pick<L402ChallengeFields, "macaroon" | "scheme">,
  preimage: string,
): PaidCredential {
  assertPreimageHex(preimage);
  const normalizedPreimage = preimage.toLowerCase();
  const macaroons = [challenge.macaroon];
  return {
    authorization: buildAuthorizationHeader({
      macaroons,
      preimage: normalizedPreimage,
      legacy: challenge.scheme === "LSAT",
    }),
    scheme: challenge.scheme,
    macaroon: challenge.macaroon,
    macaroons,
    preimage: normalizedPreimage,
  };
}

export function withAuthorization(init: RequestInit, credential: PaidCredential): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", credential.authorization);
  return { ...init, headers };
}

/**
 * Parse a full user-supplied `Authorization` value into the same credential
 * shape the pay-and-retry flow caches.
 *
 * L402 protocol-specification.md §5.2 defines the credential header syntax;
 * §8 defines reuse of the resulting bearer credential until server rejection.
 */
export function parsePastedCredential(input: string): PaidCredential {
  const fields = parseAuthorizationHeader(normalizePastedCredentialInput(input));
  const preimage = fields.preimage.toLowerCase();
  return {
    authorization: buildAuthorizationHeader({
      macaroons: fields.macaroons,
      preimage,
      legacy: fields.scheme === "LSAT",
    }),
    scheme: fields.scheme,
    macaroon: fields.macaroons[0]!,
    macaroons: fields.macaroons,
    preimage,
  };
}

function normalizePastedCredentialInput(input: string): string {
  const trimmed = input.trim().replace(/^authorization\s*:\s*/i, "");
  if (/^(L402|LSAT)\s+/i.test(trimmed)) return trimmed;
  return `L402 ${trimmed}`;
}

/**
 * Build a reusable credential from separate macaroon and preimage inputs.
 * This supports playground workflows where the macaroon comes from Workbench
 * memory and the preimage comes from a wallet or a shared note.
 */
export function buildPastedCredentialParts(
  macaroon: string,
  preimage: string,
  scheme: "L402" | "LSAT" = "L402",
): PaidCredential {
  return parsePastedCredential(
    buildAuthorizationHeader({
      macaroons: macaroon.trim(),
      preimage: parsePastedPreimage(preimage),
      legacy: scheme === "LSAT",
    }),
  );
}

/**
 * Validate that `input` is a 32-byte hex string suitable for use as an L402
 * payment preimage. Returns the lowercase-normalized value.
 *
 * Surfaces a stable error message (`"invalid-preimage"`) so UI code can map
 * it to user-facing copy without parsing error text.
 */
export function parsePastedPreimage(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length !== PREIMAGE_HEX_LENGTH || !HEX_RE.test(trimmed)) {
    throw new Error("invalid-preimage");
  }
  return trimmed.toLowerCase();
}

function pickChallenge(headers: Headers): L402ChallengeFields {
  const raw = headers.get("www-authenticate");
  if (raw === null || raw.trim() === "") {
    throw new FetchPaidResourceError({
      kind: "payment-challenge-missing",
      status: 402,
    });
  }
  let challenges: L402ChallengeFields[];
  try {
    challenges = parseAuthenticateHeader(raw);
  } catch (error) {
    throw new FetchPaidResourceError(
      {
        kind: "payment-challenge-invalid",
        status: 402,
        message: error instanceof Error ? error.message : String(error),
      },
      { cause: error },
    );
  }
  // Per L402 spec §10: prefer L402 over LSAT when both are advertised.
  const l402 = challenges.find((c) => c.scheme === "L402");
  const chosen = l402 ?? challenges[0];
  if (chosen === undefined) {
    throw new FetchPaidResourceError({
      kind: "payment-challenge-invalid",
      status: 402,
      message: "empty-challenge-set",
    });
  }
  return chosen;
}

function assertPreimageHex(value: string): void {
  if (value.length !== PREIMAGE_HEX_LENGTH || !HEX_RE.test(value)) {
    throw new Error("invalid-preimage");
  }
}
