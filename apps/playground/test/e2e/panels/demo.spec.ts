import { expect, test } from "@playwright/test";

test.describe("panels / demo", () => {
  test("fetches the default unprotected Pokedex endpoint", async ({ page }) => {
    await page.route("https://pokeapi.co/api/v2/pokemon/1", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        json: { id: 1, name: "bulbasaur" },
      });
    });

    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      "https://pokeapi.co/api/v2/pokemon/1",
    );
    await page.click("[data-testid='demo-fetch']");

    await expect(page.locator("[data-testid='demo-output']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-status']")).toHaveText("200");
    await expect(page.locator("[data-testid='demo-authenticate']")).toHaveText("(none)");
    await expect(page.locator("[data-testid='demo-body']")).toContainText("bulbasaur");
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText(
      "recipe code",
    );
  });

  test("can point at an externally protected Boltwall endpoint", async ({ page }) => {
    const endpoint = "https://boltwall.example.test/api/protected/1";
    await page.route(endpoint, async (route) => {
      await route.fulfill({
        status: 402,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "www-authenticate",
          "content-type": "application/json",
          "www-authenticate": 'L402 macaroon="abc", invoice="lnbc1demo"',
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.fill("[data-testid='demo-endpoint-input']", endpoint);
    await page.click("[data-testid='demo-fetch']");

    await expect(page.locator("[data-testid='demo-output']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-status']")).toHaveText("402");
    await expect(page.locator("[data-testid='demo-authenticate']")).toContainText("L402");
  });
});
