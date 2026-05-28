import pino from "pino";
import type { DestinationStream } from "pino";

import { noopLogger, type MinimalLogger } from "./core/types.js";

export const REDACTED_PATHS = [
  "macaroon",
  "macaroons",
  "preimage",
  "rootKey",
  "*.macaroon",
  "*.macaroons",
  "*.preimage",
  "*.rootKey",
  "*.paymentRequest",
  "*.cert",
  "*.macaroon_base64",
  "*.secret",
  "headers.authorization",
  "headers.Authorization",
  "config.rootKey",
  "context.identifier.tokenId",
  "credential.macaroons",
  "credential.preimageHex",
] as const;

/**
 * Default structured logger with redaction for L402 bearer credentials.
 *
 * Security boundary: macaroons, preimages, root keys, and payment requests
 * are redacted to [REDACTED] at all log levels. This prevents bearer
 * credentials from appearing in log aggregation pipelines.
 *
 * Per AGENTS.md security-boundaries: macaroons and preimages must not be
 * logged at info level.
 */
export function createLogger(
  opts: { level?: string; name?: string; stream?: DestinationStream } = {},
): MinimalLogger {
  return pino(
    {
      level: opts.level ?? "info",
      name: opts.name ?? "boltwall",
      redact: {
        paths: [...REDACTED_PATHS],
        censor: "[REDACTED]",
      },
    },
    opts.stream,
  );
}

export const defaultLogger: MinimalLogger = createLogger();
export { noopLogger };
