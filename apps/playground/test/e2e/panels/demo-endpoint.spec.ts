import { expect, test } from "@playwright/test";

import { setTheme } from "../setup";

test.describe("panels / demo — endpoint client", () => {
  test("fetches a configured endpoint without a wallet provider", async ({ page }) => {
    await setTheme(page, "light");
    const endpoint = "https://demo.example.test/pokemon";
    await page.route(endpoint, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        json: { source: "configured-endpoint" },
      });
    });

    await page.goto("/p/demo");
    await page.fill("[data-testid='demo-endpoint-input']", endpoint);
    await page.click("[data-testid='demo-fetch']");
    await expect(page.locator("[data-testid='demo-body']")).toContainText(
      "configured-endpoint",
    );
  });
});
