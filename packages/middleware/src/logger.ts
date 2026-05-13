import pino from "pino";

import type { MinimalLogger } from "./core/types.js";

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
export const defaultLogger: MinimalLogger = pino({
  redact: {
    paths: [
      "*.macaroon",
      "*.macaroons",
      "*.preimage",
      "*.rootKey",
      "*.paymentRequest",
      "*.cert",
      "*.macaroon_base64",
      "*.secret",
      "credential.macaroons",
      "credential.preimageHex",
    ],
    censor: "[REDACTED]",
  },
});

/** No-op logger for contexts where logging is explicitly disabled. */
export const noopLogger: MinimalLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};
