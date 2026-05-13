import { describe, expect, test } from "bun:test";

import { createLogger, REDACTED_PATHS } from "../src/logger";

function captureLogger(level = "info") {
  const chunks: string[] = [];
  const logger = createLogger({
    level,
    name: "test-logger",
    stream: {
      write(chunk: string) {
        chunks.push(chunk);
      },
    },
  });

  return {
    logger,
    output: () => chunks.join(""),
  };
}

describe("logger redaction", () => {
  test("exports the redaction paths used by the default logger", () => {
    expect(REDACTED_PATHS).toContain("macaroon");
    expect(REDACTED_PATHS).toContain("preimage");
    expect(REDACTED_PATHS).toContain("rootKey");
    expect(REDACTED_PATHS).toContain("headers.authorization");
  });

  test("redacts macaroon, preimage, root key, and authorization header fields", () => {
    const { logger, output } = captureLogger();

    logger.info(
      {
        macaroon: "actual-macaroon-base64",
        nested: { preimage: "actual-preimage-hex", rootKey: "actual-root-key" },
        headers: { authorization: "L402 macaroon:preimage" },
        publicField: "safe-to-log",
      },
      "synthetic credential event",
    );

    const line = output();
    expect(line).toContain("[REDACTED]");
    expect(line).toContain("safe-to-log");
    expect(line).not.toContain("actual-macaroon-base64");
    expect(line).not.toContain("actual-preimage-hex");
    expect(line).not.toContain("actual-root-key");
    expect(line).not.toContain("L402 macaroon:preimage");
  });

  test("leaves unrelated fields unchanged", () => {
    const { logger, output } = captureLogger();

    logger.info({ requestId: "req-123", status: 402 }, "ordinary event");

    const line = output();
    expect(line).toContain("req-123");
    expect(line).toContain('"status":402');
    expect(line).not.toContain("[REDACTED]");
  });

  test("respects configured log level", () => {
    const { logger, output } = captureLogger("warn");

    logger.info({ requestId: "hidden" }, "below level");
    expect(output()).toBe("");

    logger.warn({ requestId: "visible" }, "at level");
    expect(output()).toContain("visible");
  });
});
