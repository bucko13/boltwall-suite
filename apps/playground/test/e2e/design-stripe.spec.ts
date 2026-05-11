import { expect, test } from "@playwright/test";

// Fixture byte counts from macaroonCodecFixtures[1] in @boltwall/test-fixtures.
// identifier: 64 bytes, location: "lsat.boltwall.io" = 16 bytes,
// caveat[0]: "services=pokedex:0" = 18 bytes, caveat[1]: "pokedex_capabilities=read" = 25 bytes,
// signature: 32 bytes (demo).
const EXPECTED = {
  identifier: 66, // 2 version bytes + 32 token hash + 32 payment hash
  location: 16,
  caveat0: 18,
  caveat1: 25,
  signature: 32,
};

test.describe("MacaroonStripe primitive", () => {
  test("renders 4 segment types with correct byte counts", async ({ page }) => {
    await page.goto("/design");

    const stripe = page.locator("[data-testid='macaroon-stripe']");
    await expect(stripe).toBeVisible();

    await expect(page.locator("[data-testid='stripe-bytes-identifier']")).toHaveText(
      `${EXPECTED.identifier}B`,
    );
    await expect(page.locator("[data-testid='stripe-bytes-location']")).toHaveText(
      `${EXPECTED.location}B`,
    );
    await expect(page.locator("[data-testid='stripe-bytes-caveat-0']")).toHaveText(
      `${EXPECTED.caveat0}B`,
    );
    await expect(page.locator("[data-testid='stripe-bytes-caveat-1']")).toHaveText(
      `${EXPECTED.caveat1}B`,
    );
    await expect(page.locator("[data-testid='stripe-bytes-signature']")).toHaveText(
      `${EXPECTED.signature}B`,
    );
  });

  test("clicking a segment reveals raw bytes in segment detail", async ({ page }) => {
    await page.goto("/design");

    // Click identifier segment
    await page.locator("[data-testid='stripe-seg-identifier']").click();
    const detail = page.locator("[data-testid='segment-detail']");
    await expect(detail).toBeVisible();
    // Should show hex content — identifier starts with 0000aa...
    await expect(detail).toContainText("00 00 aa");
  });

  test("clicking signature segment reveals 32-byte hex dump", async ({ page }) => {
    await page.goto("/design");

    await page.locator("[data-testid='stripe-seg-signature']").click();
    const detail = page.locator("[data-testid='segment-detail']");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText(`${EXPECTED.signature} bytes`);
    // Signature starts with 7d9c13...
    await expect(detail).toContainText("7d 9c 13");
  });
});
