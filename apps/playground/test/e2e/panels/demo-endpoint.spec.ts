import { expect, test } from "@playwright/test";

import { setTheme } from "../setup";

test.describe("panels / demo — endpoint client", () => {
  test("shows and resets the default endpoint without a disclosure", async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/p/demo");

    await expect(page.locator("[data-testid='demo-endpoint-settings']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-active-endpoint']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      "https://pokeapi.co/api/v2/pokemon/{id}",
    );
    await expect(page.locator("[data-testid='demo-endpoint-reset']")).toHaveCount(0);

    await page.fill("[data-testid='demo-endpoint-input']", "https://demo.example.test/pokemon/25");
    await expect(page.locator("[data-testid='demo-endpoint-reset']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Fetch Endpoint");

    await page.click("[data-testid='demo-endpoint-reset']");
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      "https://pokeapi.co/api/v2/pokemon/{id}",
    );
    await expect(page.locator("[data-testid='demo-endpoint-reset']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Get Random Pokemon");
  });

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
    await page.fill("[data-testid='demo-endpoint-input']", endpoint);
    await expect(page.locator("[data-testid='demo-endpoint-reset']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Fetch Endpoint");
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText(
      "configured-endpoint",
    );
  });
});
