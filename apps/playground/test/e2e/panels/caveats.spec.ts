import { expect, test } from "@playwright/test";

test.describe("panels / caveats", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText("exact code");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText("const caveats = []");
    await expect(page.locator("[data-testid='code-snippet']")).not.toContainText("pokedex:0");
  });

  test("add a caveat and see it in the list", async ({ page }) => {
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");

    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    await expect(page.locator("[data-testid='caveats-output']")).toContainText(
      "services=pokedex:0",
    );
    await expect(page.locator("[data-testid='code-snippet']")).toContainText('"services"');
    await expect(page.locator("[data-testid='code-snippet']")).toContainText('"pokedex:0"');
  });

  test("add two caveats then remove first", async ({ page }) => {
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");

    await page.fill("[data-testid='caveat-condition-input']", "valid-until");
    await page.fill("[data-testid='caveat-value-input']", "9999999999000");
    await page.click("[data-testid='caveat-add']");

    await expect(page.locator("[data-testid='caveats-output']")).toContainText("valid-until");

    await page.locator("[data-testid='caveat-remove-0']").click();
    await expect(page.locator("[data-testid='caveats-output']")).not.toContainText(
      "services=pokedex:0",
    );
  });

  test("missing condition shows error", async ({ page }) => {
    await page.fill("[data-testid='caveat-value-input']", "something");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-error']")).toBeVisible();
  });

  test("reset clears the list", async ({ page }) => {
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();

    await page.click("[data-testid='caveats-reset']");
    await expect(page.locator("[data-testid='caveats-list']")).not.toBeVisible();
  });
});
