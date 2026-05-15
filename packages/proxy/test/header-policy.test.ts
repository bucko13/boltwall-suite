import { describe, expect, test } from "bun:test";

import { shouldForwardHeader } from "../src/header-policy";

describe("proxy header policy", () => {
  test("strips bearer credentials and cookies by default", () => {
    expect(shouldForwardHeader("authorization")).toBe(false);
    expect(shouldForwardHeader("Cookie")).toBe(false);
    expect(shouldForwardHeader("x-request-id")).toBe(true);
  });

  test("applies allow patterns before forwarding non-denied headers", () => {
    const policy = { allow: ["x-custom-*"] };

    expect(shouldForwardHeader("x-custom-foo", policy)).toBe(true);
    expect(shouldForwardHeader("x-other", policy)).toBe(false);
    expect(shouldForwardHeader("cookie", policy)).toBe(false);
  });

  test("applies explicit deny patterns case-insensitively", () => {
    const policy = { deny: ["x-secret-*"] };

    expect(shouldForwardHeader("X-Secret-Token", policy)).toBe(false);
    expect(shouldForwardHeader("X-Public-Token", policy)).toBe(true);
  });
});
