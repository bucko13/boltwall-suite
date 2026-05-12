import { expect, test } from "@playwright/test";

// Macaroon with valid-until=9999999999000 caveat
// Minted with mintMacaroon({ rootKey: 0x00..1f, identifier: { version:0, paymentHash: 0x01*32, tokenId: 0x20*32 }, caveats: [{condition:"valid-until",value:"9999999999000"}] })
const FIXTURE_MACAROON_WITH_CAVEAT =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIZdmFsaWQtdW50aWw9OTk5OTk5OTk5OTAwMAAABiAjHO+oY0jzCNj0uSNSma7NrhmXFsiPutNILxobLhOkqA==";

test.describe("panels / satisfy", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/satisfy");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
  });

  test("add valid-until satisfier against token with caveat shows matched result", async ({
    page,
  }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    // valid-until is the default selector; just add it.
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");

    await expect(page.locator("[data-testid='satisfy-output']")).toBeVisible();
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("valid-until");
  });

  test("remove satisfier changes result to unsatisfied", async ({ page }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("valid-until");

    // Remove the satisfier
    await page.locator("[data-testid='satisfy-remove-0']").click();
    await page.click("[data-testid='satisfy-run']");
    // caveat appears as unsatisfied
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("valid-until");
  });

  test("missing token shows error", async ({ page }) => {
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='satisfy-error']")).toBeVisible();
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='satisfy-output']")).toBeVisible();
    await page.click("[data-testid='satisfy-reset']");
    await expect(page.locator("[data-testid='satisfy-output']")).not.toBeVisible();
  });
});
