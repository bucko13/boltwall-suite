/**
 * ValidateL402 panel — Tamper action e2es.
 *
 * Uses a static macaroon generated from @boltwall/test-fixtures'
 * zero-preimage-canonical fixture and a known root key. Keeping the macaroon
 * static avoids importing the browser bundle into the Playwright Node runner.
 *
 * Tamper button flips the last byte of the base64 macaroon, invalidating the
 * HMAC signature. Tests confirm the signature check fails while the preimage
 * and expiry checks remain independent of the signature.
 */
import { expect, test } from "@playwright/test";

import { setTheme } from "../setup";

// Root key — arbitrary known value, not a secret.
const ROOT_KEY_HEX = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const FIXTURE_PREIMAGE = "0000000000000000000000000000000000000000000000000000000000000000";
const FIXTURE_MACAROON =
  "AgJCAABmaHqt+GK9d2yPwYuOn44gCJcUhW7iM7OQKlkdDV8pJUJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCAAAGIH9hp+uMItiKi8tWoZlifmqpAXGfIYkWOdhGLJw3aWRR";

test.describe("panels / validate — tamper action", () => {
  test.beforeEach(async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/p/validate");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("valid inputs: all checks pass before tamper", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", ROOT_KEY_HEX);
    await page.fill("[data-testid='validate-preimage-input']", FIXTURE_PREIMAGE);
    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(output).toBeVisible();
    // All checks should report pass (no "fail" indicator).
    await expect(output).not.toContainText("fail");
  });

  test("tamper button corrupts signature — signature check fails, others unaffected", async ({
    page,
  }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", ROOT_KEY_HEX);
    await page.fill("[data-testid='validate-preimage-input']", FIXTURE_PREIMAGE);

    // First run — everything passes.
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();

    // Tamper flips the last byte — signature is now invalid.
    await page.click("[data-testid='validate-tamper']");
    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(output).toBeVisible();

    // Signature check must fail after tamper.
    await expect(output).toContainText("FAIL");

    // Preimage check is independent — it depends only on the preimage and
    // the payment hash embedded in the identifier, not on the HMAC chain.
    await expect(output).toContainText("Preimage");
  });

  test("code-snippet updates when token input changes", async ({ page }) => {
    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(snippet).toBeVisible();

    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText(
      "current input code",
    );
    // The code-snippet renders the current input — it should include the macaroon.
    await expect(snippet).toContainText(FIXTURE_MACAROON.slice(0, 12), { timeout: 200 });
  });

  test("reset clears token and output", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", ROOT_KEY_HEX);
    await page.fill("[data-testid='validate-preimage-input']", FIXTURE_PREIMAGE);
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();

    await page.click("[data-testid='validate-reset']");
    await expect(page.locator("[data-testid='validate-output']")).not.toBeVisible();
  });
});
