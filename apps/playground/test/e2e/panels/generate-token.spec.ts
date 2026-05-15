import { expect, test } from "@playwright/test";

const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test.describe("panels / from-invoice (GenerateL402Token)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/generate");
    await expect(page.locator("[data-testid='cell']").nth(1)).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']").nth(1)).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("idle");
  });

  test("root key + empty invoice mints a macaroon (random paymentHash)", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.getByRole("group", { name: "Generated macaroon" })).toBeVisible();
    await expect(page.locator("[data-testid='generate-token-output'] input")).toHaveCount(0);
    await expect(page.locator("[data-testid='generate-token-output'] textarea")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("minted");
  });

  test("invalid key shows error", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", "tooshort");
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("error");
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
    await expect(page.locator("[data-testid='code-snippet']").first()).toContainText(
      `const rootKey = hexToBytes("${FIXTURE_KEY}")`,
    );
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "recipe code",
    );
  });

  test("minted code snippet is an exact reproducer without random generation", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "exact code",
    );
    await expect(snippet).toContainText(`const rootKey = hexToBytes("${FIXTURE_KEY}")`);
    await expect(snippet).toContainText("paymentHash: hexToBytes(");
    await expect(snippet).toContainText("tokenId: hexToBytes(");
    await expect(snippet).not.toContainText("getRandomValues");
  });

  test("minted macaroon carries into parse panel", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    const macaroon = await page.locator("[data-testid='generate-token-output'] pre").textContent();

    expect(macaroon).toBeTruthy();

    await page.getByTestId("nav-link-parse").click();
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(
      macaroon?.trim() ?? "",
    );
  });
});
