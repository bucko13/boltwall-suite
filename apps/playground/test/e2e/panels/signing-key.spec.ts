import { expect, test } from "@playwright/test";

import { grantClipboard, readClipboard } from "../setup";

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

  test("paste invalid key shows error with hover details and copy affordance", async ({
    page,
    context,
  }) => {
    await grantClipboard(context);

    await page.fill("[data-testid='signing-key-input']", "notahexkey");
    await expect(page.locator("[data-testid='signing-key-error']")).toBeVisible();
    const statusPill = page.locator("[data-testid='status-pill']");
    await expect(statusPill).toContainText("error");

    await statusPill.hover();
    const details = page.locator("[data-testid='status-pill-details']");
    await expect(details).toBeVisible();
    await expect(details).toContainText("Key must be exactly 64 hex characters (32 bytes).");

    await page.locator("[data-testid='status-pill-copy']").click();
    await expect(page.locator("[data-testid='status-pill-copy']")).toContainText("Copied");
    await expect
      .poll(() => readClipboard(page))
      .toContain("Key must be exactly 64 hex characters (32 bytes).");
  });

  test("reset clears output", async ({ page }) => {
    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='signing-key-output']")).toBeVisible();
    await page.click("[data-testid='signing-key-reset']");
    await expect(page.locator("[data-testid='signing-key-output']")).not.toBeVisible();
  });

  test("does not render a superfluous code snippet", async ({ page }) => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    await page.fill("[data-testid='signing-key-input']", key);
    await expect(page.locator("[data-testid='code-snippet']")).not.toBeVisible();
  });

  test("input and copyable output have distinct visual treatments", async ({ page }) => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    await page.fill("[data-testid='signing-key-input']", key);
    const inputBackground = await page
      .locator("[data-testid='signing-key-input']")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    const outputBackground = await page
      .locator("[data-testid='signing-key-output'] pre")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(inputBackground).not.toBe(outputBackground);
  });

  test("saved signing key carries into token generation", async ({ page }) => {
    const key = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("key: empty");

    await page.fill("[data-testid='signing-key-input']", key);
    await expect(page.locator("[data-testid='signing-key-input']")).toHaveValue(key);
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("00010203");

    await page.getByRole("link", { name: "Generate L402 Token" }).click();
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(key);
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("00010203");

    await page.click("[data-testid='workbench-memory-key-clear']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("key: empty");
  });
});
