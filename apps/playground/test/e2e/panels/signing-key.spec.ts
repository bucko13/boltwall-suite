import { expect, test } from "@playwright/test";

test.describe("panels / signing-key", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/signing-key");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
  });

  test("generate button produces a 64-char hex key", async ({ page }) => {
    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='signing-key-output']")).toBeVisible();
    const input = page.locator("[data-testid='signing-key-input']");
    const value = await input.inputValue();
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    await expect(page.locator("[data-testid='status-pill']")).toContainText("ready");
  });

  test("paste a valid 64-char hex key shows output", async ({ page }) => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    await page.fill("[data-testid='signing-key-input']", key);
    await expect(page.locator("[data-testid='signing-key-output']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("ready");
  });

  test("paste invalid key shows error", async ({ page }) => {
    await page.fill("[data-testid='signing-key-input']", "notahexkey");
    await expect(page.locator("[data-testid='signing-key-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("reset clears output", async ({ page }) => {
    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='signing-key-output']")).toBeVisible();
    await page.click("[data-testid='signing-key-reset']");
    await expect(page.locator("[data-testid='signing-key-output']")).not.toBeVisible();
  });

  test("code snippet contains key value", async ({ page }) => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    await page.fill("[data-testid='signing-key-input']", key);
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(key);
  });
});
