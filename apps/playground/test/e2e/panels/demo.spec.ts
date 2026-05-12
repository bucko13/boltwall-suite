import { expect, test } from "@playwright/test";

test.describe("panels / demo", () => {
  test("shows WebLN not detected when webln is absent", async ({ page }) => {
    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-no-webln']")).toBeVisible();
  });

  test("connect button with injected mock webln shows node info", async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { webln?: unknown }).webln = {
        enable: async () => {},
        getInfo: async () => ({
          node: { pubkey: "03abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab" },
        }),
      };
    });

    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.click("[data-testid='demo-connect']");

    await expect(page.locator("[data-testid='demo-output']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-output']")).toContainText("03abcdef");
  });

  test("sendPayment is never invoked", async ({ page }) => {
    await page.addInitScript(() => {
      const win = window as unknown as {
        webln?: {
          enable(): Promise<void>;
          getInfo(): Promise<{ node: { pubkey: string } }>;
          sendPayment(): void;
        };
        __paymentCalled?: boolean;
      };
      win.webln = {
        enable: async () => {},
        getInfo: async () => ({ node: { pubkey: "03aaa" } }),
        sendPayment: () => {
          win.__paymentCalled = true;
        },
      };
    });

    await page.goto("/p/demo");
    const connectBtn = page.locator("[data-testid='demo-connect']");
    if (await connectBtn.isEnabled()) {
      await connectBtn.click();
      await page.waitForTimeout(300);
    }

    const paymentCalled = await page.evaluate(
      () => !!(window as Window & { __paymentCalled?: boolean }).__paymentCalled,
    );
    expect(paymentCalled).toBe(false);
  });
});
