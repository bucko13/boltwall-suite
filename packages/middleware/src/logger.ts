import pino from "pino";
import type { DestinationStream } from "pino";

import { noopLogger, type MinimalLogger } from "./core/types.js";

/**
 * Pino redaction paths that strip L402 bearer credentials from log output.
 *
 * This is a security boundary, not a cosmetic filter: every path here is a
 * place a macaroon, preimage, root key, payment request, or Authorization
 * header can surface. Only add entries — removing one can leak a bearer
 * credential into log aggregation. Consumed by {@link createLogger}.
 *
 * @example
 * ```ts
 * const log = pino({ redact: { paths: [...REDACTED_PATHS], censor: "[REDACTED]" } });
 * ```
 */
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

/**
 * Shared default logger instance used when no `logger` is supplied to the
 * middleware.
 *
 * This is a single canonical instance built from {@link createLogger} with
 * default options ("info" level, "boltwall" name, {@link REDACTED_PATHS}
 * redaction). Call {@link createLogger} instead when you need a distinct
 * level, name, or destination stream.
 *
 * @example
 * ```ts
 * import { defaultLogger } from "@boltwall/middleware";
 * defaultLogger.info({ kind: "payment-required" }, "challenge issued");
 * ```
 */
export const defaultLogger: MinimalLogger = createLogger();
export { noopLogger };
