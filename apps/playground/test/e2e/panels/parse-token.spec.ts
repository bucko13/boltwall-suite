import { expect, test } from "@playwright/test";

// Minted with mintMacaroon({ rootKey: 0x00..1f, identifier: { version:0, paymentHash: 0x01*32, tokenId: 0x20*32 } })
const FIXTURE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";
const GENERATED_MACAROON =
  "AgJCAACjYUgfAWJ7NsGTZav4iaFhf3eMbvUKu7qJ+G3DuWV2pUmVqvTlEIx/6ceKAr2DSiSG5T5D2Z2NS6U9yu81OtiEAAAGIDWz7T0J5FgeAAZvh/Dx3lKJFnB/FmWQClLDLejNpHCp";

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

  test("decode accepts a full L402 challenge", async ({ page }) => {
    await page.fill(
      "[data-testid='parse-token-input']",
      `WWW-Authenticate: L402 macaroon="${FIXTURE_MACAROON}", invoice="lnbc1demo"`,
    );
    await page.click("[data-testid='parse-token-decode']");

    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-payment-hash']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("decoded");
  });

  test("decode accepts a full Authorization credential", async ({ page }) => {
    await page.fill(
      "[data-testid='parse-token-input']",
      `Authorization: L402 ${FIXTURE_MACAROON}:${"00".repeat(32)}`,
    );
    await page.click("[data-testid='parse-token-decode']");

    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-payment-hash']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("decoded");
  });

  test("decode accepts a macaroon minted in the generate panel", async ({ page }) => {
    await page.goto("/p/generate");
    await page.fill(
      "[data-testid='generate-token-key-input']",
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    );
    await page.click("[data-testid='generate-token-mint']");
    const macaroon = await page.locator("[data-testid='generate-token-output'] pre").textContent();

    expect(macaroon).toBeTruthy();
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );

    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(
      macaroon?.trim() ?? "",
    );
    await page.click("[data-testid='parse-token-decode']");

    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-payment-hash']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("decoded");
  });

  test("decode treats generated-looking base64 as a raw macaroon", async ({ page }) => {
    await page.fill("[data-testid='parse-token-input']", GENERATED_MACAROON);
    await page.click("[data-testid='parse-token-decode']");

    await expect(page.locator("[data-testid='parse-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-error']")).toHaveCount(0);
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
