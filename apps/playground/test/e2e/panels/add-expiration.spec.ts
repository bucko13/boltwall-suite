import { expect, test } from "@playwright/test";

test.describe("panels / add-expiration", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/add-expiration");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
  });

  test("entering seconds and clicking Build Caveat shows output", async ({ page }) => {
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");
    await expect(page.locator("[data-testid='expiration-output']")).toBeVisible();
    await expect(page.locator("[data-testid='expiration-output']")).toContainText("valid-until");
    const value = await page.locator("[data-testid='expiration-output']").textContent();
    expect(value).toContain("serialized: valid-until=");
    const isoValue = value?.match(/value:\s*([0-9TZ:.-]+)/)?.[1];
    expect(isoValue).toBeDefined();
    expect(Date.parse(isoValue ?? "")).not.toBeNaN();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("ready");
  });

  test("invalid input shows error", async ({ page }) => {
    await page.fill("[data-testid='expiration-seconds-input']", "-1");
    await page.click("[data-testid='expiration-compute']");
    await expect(page.locator("[data-testid='expiration-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");
    await expect(page.locator("[data-testid='expiration-output']")).toBeVisible();
    await page.click("[data-testid='expiration-reset']");
    await expect(page.locator("[data-testid='expiration-output']")).not.toBeVisible();
  });

  test("code snippet contains seconds value", async ({ page }) => {
    await page.fill("[data-testid='expiration-seconds-input']", "7200");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText("7200");
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText(
      "recipe code",
    );
  });

  test("built expiration snippet uses exact generated timestamp", async ({ page }) => {
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");

    const output = await page.locator("[data-testid='expiration-output']").textContent();
    const isoValue = output?.match(/value:\s*([0-9TZ:.-]+)/)?.[1];
    expect(isoValue).toBeDefined();

    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText("exact code");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      `value: "${isoValue}"`,
    );
    await expect(page.locator("[data-testid='code-snippet']")).not.toContainText("Date.now()");
  });
});
