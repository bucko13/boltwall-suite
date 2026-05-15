import { expect, test } from "@playwright/test";

// Minted with mintMacaroon({ rootKey: 0x00..1f, identifier: { version:0, paymentHash: 0x01*32, tokenId: 0x20*32 } })
const FIXTURE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";

test.describe("panels / parse-token", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='cell']").nth(1)).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']").nth(1)).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("idle");
  });

  test("decode shows identifier fields", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", FIXTURE_MACAROON);
    await page.click("[data-testid='parse-token-decode']");

    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-output']")).toContainText(
      "Decoded macaroon fields",
    );
    await expect(page.locator("[data-testid='parse-token-payment-hash']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-token-id']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("decoded");
  });

  test("stripe view shows macaroon-stripe primitive", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", FIXTURE_MACAROON);
    await page.click("[data-testid='parse-token-decode']");
    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();

    await page
      .locator("[data-testid='view-mode-toggle'] button")
      .filter({ hasText: "stripe" })
      .click();
    await expect(page.locator("[data-testid='macaroon-stripe']")).toBeVisible();
  });

  test("invalid input shows error", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", "not-valid-base64!!!");
    await page.click("[data-testid='parse-token-decode']");
    await expect(page.locator("[data-testid='parse-token-error']")).toBeVisible();
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", FIXTURE_MACAROON);
    await page.click("[data-testid='parse-token-decode']");
    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await page.click("[data-testid='parse-token-reset']");
    await expect(page.locator("[data-testid='parse-token-output']")).not.toBeVisible();
  });

  test("code snippet reflects token value", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='code-snippet-contract']").nth(1)).toContainText(
      "current input code",
    );
    await expect(page.locator("[data-testid='code-snippet']").nth(1)).toContainText(
      `const macaroon = "${FIXTURE_MACAROON}"`,
    );
  });
});
