import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const ENDPOINT_RE = /\/api\/pokemon\/1$/;
const TEST_PREIMAGE = "11".repeat(32);

test.describe("payment flow — WebLN + manual paste fallback", () => {
  test("WebLN-mock path: flow completes against /api/pokemon/1", async ({ page }) => {
    // Install the WebLN stub before navigation so the mount-time detection
    // sees `window.webln` and enables the WebLN button. The test will
    // inject the actual preimage value into `window.__paymentPreimage`
    // after capturing the challenge from the network.
    await page.addInitScript(() => {
      const calls: string[] = [];
      const webln = {
        async enable() {
          calls.push("enable");
        },
        async sendPayment(_invoice: string) {
          calls.push("sendPayment");
          return { preimage: "11".repeat(32) };
        },
      };
      Object.defineProperty(window, "webln", {
        value: webln,
        configurable: true,
        writable: true,
      });
      (window as unknown as { __weblnCalls: string[] }).__weblnCalls = calls;
    });
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await expect(page.locator("[data-testid='payment-flow']")).toBeVisible();

    await page.click("[data-testid='payment-flow-start']");

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-invoice']")).toContainText("lnbc");

    await page.click("[data-testid='payment-flow-webln']");
    const result = page.locator("[data-testid='payment-flow-result']");
    await expect(result).toBeVisible();
    await expect(result).toContainText("bulbasaur");

    const weblnCalls = await page.evaluate(
      () => (window as unknown as { __weblnCalls: string[] }).__weblnCalls,
    );
    expect(weblnCalls).toEqual(["enable", "sendPayment"]);
  });

  test("manual paste path: pasted preimage retries successfully", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await page.fill("[data-testid='payment-flow-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const result = page.locator("[data-testid='payment-flow-result']");
    await expect(result).toBeVisible();
    await expect(result).toContainText("bulbasaur");
  });

  test("malformed pasted preimage surfaces an error and does not retry", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();

    await page.fill("[data-testid='payment-flow-preimage-input']", "not-hex-and-too-short");
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const error = page.locator("[data-testid='payment-flow-error']");
    await expect(error).toBeVisible();
    await expect(error).toContainText("invalid-preimage");
    await expect(page.locator("[data-testid='payment-flow-result']")).toHaveCount(0);
  });

  test("WebLN unavailable: manual fallback is still operable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "webln", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-webln']")).toBeDisabled();
    await expect(page.locator("[data-testid='payment-flow-webln']")).toContainText(
      "WebLN unavailable",
    );

    await page.fill("[data-testid='payment-flow-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const result = page.locator("[data-testid='payment-flow-result']");
    await expect(result).toBeVisible();
    await expect(result).toContainText("bulbasaur");
  });
});

async function routeProtectedPokemon(page: Page): Promise<void> {
  await page.route(ENDPOINT_RE, async (route, request) => {
    const authorization = request.headers().authorization;
    if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        json: { id: 1, name: "bulbasaur" },
      });
      return;
    }
    await route.fulfill({
      status: 402,
      headers: {
        "content-type": "application/json",
        "www-authenticate": 'L402 macaroon="abc", invoice="lnbc1demo"',
      },
      json: { error: "payment-required" },
    });
  });
}
