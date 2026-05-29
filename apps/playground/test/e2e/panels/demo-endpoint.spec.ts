import { expect, test } from "@playwright/test";

import { setTheme } from "../setup";

test.describe("panels / demo — endpoint client", () => {
  test("fetches a configured endpoint without a wallet provider", async ({ page }) => {
    await setTheme(page, "light");
    const endpoint = "https://demo.example.test/pokemon/{id}";
    await page.route(/https:\/\/demo\.example\.test\/pokemon\/\d+$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        json: {
          id: 25,
          name: "configured-endpoint",
          sprites: { front_default: "https://img.example.test/configured-endpoint.png" },
          types: [{ type: { name: "electric" } }],
        },
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", endpoint);
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Fetch Endpoint");
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText(
      "configured-endpoint",
    );
  });
});
