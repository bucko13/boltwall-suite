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
    await expect(page.locator("[data-testid='payment-flow-invoice-qr']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );

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

  test("WebLN rejection keeps the challenge and manual fallback visible", async ({ page }) => {
    await page.addInitScript(() => {
      const webln = {
        async enable() {},
        async sendPayment(_invoice: string) {
          throw new Error("Prompt was closed");
        },
      };
      Object.defineProperty(window, "webln", {
        value: webln,
        configurable: true,
        writable: true,
      });
    });
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();

    await page.click("[data-testid='payment-flow-webln']");

    await expect(page.locator("[data-testid='payment-flow-payment-error']")).toContainText(
      "Prompt was closed",
    );
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-invoice']")).toContainText("lnbc1demo");
    await expect(page.locator("[data-testid='payment-flow-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );

    await page.fill("[data-testid='payment-flow-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='payment-flow-preimage-submit']");
    await expect(page.locator("[data-testid='payment-flow-result']")).toContainText("bulbasaur");
  });

  test("WebLN pending payment keeps the invoice visible", async ({ page }) => {
    await page.addInitScript(() => {
      const webln = {
        async enable() {},
        async sendPayment(_invoice: string) {
          await new Promise(() => {});
          return { preimage: "" };
        },
      };
      Object.defineProperty(window, "webln", {
        value: webln,
        configurable: true,
        writable: true,
      });
    });
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();

    await page.click("[data-testid='payment-flow-webln']");

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-invoice']")).toContainText("lnbc1demo");
    await expect(page.locator("[data-testid='payment-flow-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );
    await expect(page.locator("[data-testid='payment-flow-webln']")).toBeDisabled();
  });

  test("reuses a paid credential on later requests", async ({ page }) => {
    let challengeRequests = 0;
    let authorizedRequests = 0;
    await page.route(ENDPOINT_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        authorizedRequests += 1;
        await route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          json: { id: 1, name: "bulbasaur" },
        });
        return;
      }
      challengeRequests += 1;
      await route.fulfill({
        status: 402,
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'L402 macaroon="abc", invoice="lnbc1demo"',
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await page.fill("[data-testid='payment-flow-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='payment-flow-preimage-submit']");
    await expect(page.locator("[data-testid='payment-flow-result']")).toContainText("bulbasaur");
    await expect(page.locator("[data-testid='payment-flow-credential-status']")).toContainText(
      "credential cached",
    );

    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-result']")).toContainText("bulbasaur");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toHaveCount(0);
    expect(challengeRequests).toBe(1);
    expect(authorizedRequests).toBe(2);
  });

  test("clears a rejected cached credential and requests a fresh challenge", async ({ page }) => {
    let authorizedRequests = 0;
    let challengeRequests = 0;
    await page.route(ENDPOINT_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        authorizedRequests += 1;
        if (authorizedRequests === 1) {
          await route.fulfill({
            status: 200,
            headers: { "content-type": "application/json" },
            json: { id: 1, name: "bulbasaur" },
          });
          return;
        }
        await route.fulfill({
          status: 401,
          headers: { "content-type": "application/json" },
          json: { error: "credential-rejected" },
        });
        return;
      }
      challengeRequests += 1;
      await route.fulfill({
        status: 402,
        headers: {
          "content-type": "application/json",
          "www-authenticate": 'L402 macaroon="abc", invoice="lnbc1demo"',
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await page.fill("[data-testid='payment-flow-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='payment-flow-preimage-submit']");
    await expect(page.locator("[data-testid='payment-flow-result']")).toContainText("bulbasaur");

    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-credential-status']")).toHaveCount(0);
    expect(authorizedRequests).toBe(2);
    expect(challengeRequests).toBe(2);
  });

  test("malformed pasted preimage surfaces an error and does not retry", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/test-payment-flow");
    await page.click("[data-testid='payment-flow-start']");
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();

    await page.fill("[data-testid='payment-flow-preimage-input']", "not-hex-and-too-short");
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const error = page.locator("[data-testid='payment-flow-error']");
    await expect(error).toHaveCount(0);
    await expect(page.locator("[data-testid='payment-flow-payment-error']")).toContainText(
      "invalid-preimage",
    );
    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
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
