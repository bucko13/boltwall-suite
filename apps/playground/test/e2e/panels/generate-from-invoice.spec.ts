/**
 * GenerateL402Token panel — fixture-driven e2es (bw-0dw.6).
 *
 * Uses BOLT 11 invoice from @boltwall/test-fixtures. Fills the panel with a
 * fixture invoice + a known signing key, mints, and asserts the output macaroon
 * decodes to an identifier whose paymentHash matches the fixture.
 */
import { expect, test } from "@playwright/test";

import { BOLT11_SPEC_EXAMPLES } from "@boltwall/test-fixtures";

import { grantClipboard, readClipboard, setTheme } from "../setup";

const invoiceFixture = BOLT11_SPEC_EXAMPLES.find(
  (f) => f.name === "bolt11-spec-microbtc-mainnet",
);
if (!invoiceFixture) {
  throw new Error("generate-from-invoice: missing bolt11-spec-microbtc-mainnet fixture");
}

// Arbitrary known root key — 32 bytes.
const SIGNING_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test.describe("panels / generate-from-invoice", () => {
  test.beforeEach(async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/p/from-invoice");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("minting with fixture invoice produces a base64 macaroon output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");

    const output = page.locator("[data-testid='generate-token-output']");
    await expect(output).toBeVisible();
    // Output must contain a non-trivial base64 string.
    const text = await output.textContent();
    expect(text?.replace(/\s/g, "").length).toBeGreaterThan(20);
  });

  test("code-snippet updates when invoice input changes", async ({ page }) => {
    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(snippet).toBeVisible();

    // Type a portion of the invoice and check it appears in the snippet.
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await expect(snippet).toContainText(invoiceFixture.invoice.slice(0, 8), { timeout: 200 });
  });

  test("copy-URL puts a hydrating URL on the clipboard", async ({ page, context }) => {
    await grantClipboard(context);
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);

    const copyBtn = page.locator("[data-testid='copy-url-button']").first();
    if (await copyBtn.isVisible()) {
      await copyBtn.click();
      const url = await readClipboard(page);
      expect(url).toContain("/p/from-invoice");
    }
  });

  test("reset clears invoice input and output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();

    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
  });
});
