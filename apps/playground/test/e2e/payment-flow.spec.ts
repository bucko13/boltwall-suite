import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const PREIMAGE_HEX_RE = /^[0-9a-f]{64}$/;
const HEADER_PREFIX_RE = /^(?:L402|LSAT)\s+/;
const ENDPOINT_RE = /\/api\/pokemon\/1$/;

test.describe("payment flow — WebLN + manual paste fallback", () => {
  test("WebLN-mock path: flow completes against /api/pokemon/1", async ({ page, request }) => {
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
          const preimage = (window as unknown as { __paymentPreimage?: string })
            .__paymentPreimage;
          if (preimage === undefined) {
            throw new Error("test preimage not seeded");
          }
          return { preimage };
        },
      };
      Object.defineProperty(window, "webln", {
        value: webln,
        configurable: true,
        writable: true,
      });
      (window as unknown as { __weblnCalls: string[] }).__weblnCalls = calls;
    });

    await page.goto("/test-payment-flow");
    await expect(page.locator("[data-testid='payment-flow']")).toBeVisible();

    const challengePromise = waitForChallengeHeader(page);
    await page.click("[data-testid='payment-flow-start']");
    const challengeHeader = await challengePromise;
    const preimage = await settleViaPostHelper(request, challengeHeader);

    await page.evaluate((injectedPreimage) => {
      (window as unknown as { __paymentPreimage: string }).__paymentPreimage = injectedPreimage;
    }, preimage);

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

  test("manual paste path: pasted preimage retries successfully", async ({ page, request }) => {
    await page.goto("/test-payment-flow");
    const challengePromise = waitForChallengeHeader(page);
    await page.click("[data-testid='payment-flow-start']");
    const challengeHeader = await challengePromise;
    const preimage = await settleViaPostHelper(request, challengeHeader);

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await page.fill("[data-testid='payment-flow-preimage-input']", preimage);
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const result = page.locator("[data-testid='payment-flow-result']");
    await expect(result).toBeVisible();
    await expect(result).toContainText("bulbasaur");
  });

  test("malformed pasted preimage surfaces an error and does not retry", async ({ page }) => {
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

  test("WebLN unavailable: manual fallback is still operable", async ({ page, request }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "webln", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });

    await page.goto("/test-payment-flow");
    const challengePromise = waitForChallengeHeader(page);
    await page.click("[data-testid='payment-flow-start']");
    const challengeHeader = await challengePromise;
    const preimage = await settleViaPostHelper(request, challengeHeader);

    await expect(page.locator("[data-testid='payment-flow-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='payment-flow-webln']")).toBeDisabled();
    await expect(page.locator("[data-testid='payment-flow-webln']")).toContainText(
      "WebLN unavailable",
    );

    await page.fill("[data-testid='payment-flow-preimage-input']", preimage);
    await page.click("[data-testid='payment-flow-preimage-submit']");

    const result = page.locator("[data-testid='payment-flow-result']");
    await expect(result).toBeVisible();
    await expect(result).toContainText("bulbasaur");
  });
});

/**
 * Capture the `WWW-Authenticate` header from the in-page 402 response, so
 * tests can settle the *same* challenge the UI is rendering. Each fresh GET
 * mints a new payment hash, so re-fetching via the request context would
 * desynchronize the preimage from the challenge.
 */
async function waitForChallengeHeader(page: Page): Promise<string> {
  const response = await page.waitForResponse(
    (res) => ENDPOINT_RE.test(res.url()) && res.status() === 402,
  );
  const header = (await response.headerValue("www-authenticate")) ?? "";
  expect(header.length).toBeGreaterThan(0);
  return header;
}

/**
 * POST the captured challenge back to the test-mode settle helper exposed
 * by the paid Pokedex endpoint (see bw-0dw.3). Extracts the resulting
 * preimage from the returned Authorization header.
 */
async function settleViaPostHelper(
  request: APIRequestContext,
  challengeHeader: string,
): Promise<string> {
  const payment = await request.post("/api/pokemon/1", {
    data: { challenge: challengeHeader },
  });
  const { authorization } = (await payment.json()) as { authorization: string };
  const credential = authorization.replace(HEADER_PREFIX_RE, "");
  const colonIndex = credential.lastIndexOf(":");
  expect(colonIndex).toBeGreaterThan(0);
  const preimage = credential.slice(colonIndex + 1).toLowerCase();
  expect(preimage).toMatch(PREIMAGE_HEX_RE);
  return preimage;
}
