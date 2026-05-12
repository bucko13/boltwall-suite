/**
 * Demo panel — WebLN connect-only e2es (bw-0dw.6).
 *
 * Asserts:
 *   - Without WebLN → "not detected" state shown.
 *   - With injected mock WebLN → getInfo() pubkey rendered.
 *   - sendPayment is never invoked (connect-only invariant).
 *
 * No fixture data is required; test vectors are the WebLN provider mock itself.
 */
import { expect, test } from "@playwright/test";

import { injectWebln, setTheme } from "../setup";

const MOCK_PUBKEY = "03abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab";

test.describe("panels / demo — WebLN", () => {
  test("shows not-detected state when window.webln is absent", async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-no-webln']")).toBeVisible();
  });

  test("injected WebLN: connect renders node pubkey from getInfo()", async ({ page }) => {
    await setTheme(page, "light");
    await injectWebln(page, { pubkey: MOCK_PUBKEY });
    await page.goto("/p/demo");

    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.click("[data-testid='demo-connect']");

    await expect(page.locator("[data-testid='demo-output']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-output']")).toContainText(
      MOCK_PUBKEY.slice(0, 8),
    );
  });

  test("sendPayment spy: connect-only invariant — sendPayment is never invoked", async ({ page }) => {
    await setTheme(page, "light");
    await injectWebln(page, { trackPayment: true });
    await page.goto("/p/demo");

    const connectBtn = page.locator("[data-testid='demo-connect']");
    if (await connectBtn.isEnabled()) {
      await connectBtn.click();
      // Brief wait to allow any async invocations to settle.
      await page.waitForTimeout(300);
    }

    const paymentCalled = await page.evaluate(
      () => !!(window as Window & { __paymentCalled?: boolean }).__paymentCalled,
    );
    expect(paymentCalled).toBe(false);
  });

  test("error state shown when webln.enable() rejects", async ({ page }) => {
    await setTheme(page, "light");
    await page.addInitScript(() => {
      (window as Window & { webln?: unknown }).webln = {
        enable: async () => { throw new Error("User rejected"); },
        getInfo: async () => ({ node: { pubkey: "03aaa" } }),
      };
    });
    await page.goto("/p/demo");
    await page.click("[data-testid='demo-connect']");
    await expect(page.locator("[data-testid='demo-error']")).toBeVisible();
  });
});
