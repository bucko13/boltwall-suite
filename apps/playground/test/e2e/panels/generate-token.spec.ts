import { expect, test } from "@playwright/test";

const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test.describe("panels / from-invoice (GenerateL402Token)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/from-invoice");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
  });

  test("root key + empty invoice mints a macaroon (random paymentHash)", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("minted");
  });

  test("invalid key shows error", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", "tooshort");
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
  });

  test("code snippet reflects key value", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      FIXTURE_KEY.slice(0, 16),
    );
  });
});
