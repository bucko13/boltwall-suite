import { expect, test } from "@playwright/test";

import { grantClipboard, readClipboard } from "../setup";

const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

// The standalone Signing Key card was folded into the single Generate card
// (bw-9zp.34.5). These cover the signing-key sub-section: the one root-key input
// is the producer of the Workbench signing key, and generating/pasting a key
// stages it for other panels to Fill from.
test.describe("panels / generate — signing key section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/generate");
    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
  });

  test("Generate key button produces a 64-char hex key in the root key input", async ({ page }) => {
    await page.click("[data-testid='signing-key-generate']");
    const value = await page.locator("[data-testid='generate-token-key-input']").inputValue();
    expect(value).toMatch(/^[0-9a-f]{64}$/);
  });

  test("pasting a valid 64-char hex key stages it to the Workbench", async ({ page }) => {
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("empty");
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(FIXTURE_KEY);
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");
  });

  test("pasting an invalid key surfaces an error with hover details and copy affordance", async ({
    page,
    context,
  }) => {
    await grantClipboard(context);

    await page.fill("[data-testid='generate-token-key-input']", "notahexkey");
    await expect(page.locator("[data-testid='generate-token-error']")).toBeVisible();
    const statusPill = page.locator("[data-testid='status-pill']").first();
    await expect(statusPill).toContainText("error");

    await statusPill.hover();
    const details = page.locator("[data-testid='status-pill-details']");
    await expect(details).toBeVisible();
    await expect(details).toContainText("Root key must be exactly 64 hex characters (32 bytes).");

    await page.locator("[data-testid='status-pill-copy']").click();
    await expect(page.locator("[data-testid='status-pill-copy']")).toContainText("Copied");
    await expect
      .poll(() => readClipboard(page))
      .toContain("Root key must be exactly 64 hex characters (32 bytes).");
  });

  test("the staged signing key carries into Validate via Workbench memory", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");

    await page.goto("/p/validate");
    await expect(page.locator("[data-testid='validate-workbench-signing-key']")).toContainText(
      "Workbench signing key",
    );
  });

  test("reset clears the root key and unstages the Workbench signing key", async ({ page }) => {
    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(
      /^[0-9a-f]{64}$/,
    );
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");

    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("empty");
  });
});
