import { expect, test } from "@playwright/test";

// Macaroon with valid-until=9999999999000 caveat
// Minted with mintMacaroon({ rootKey: 0x00..1f, identifier: { version:0, paymentHash: 0x01*32, tokenId: 0x20*32 }, caveats: [{condition:"valid-until",value:"9999999999000"}] })
const FIXTURE_MACAROON_WITH_CAVEAT =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIZdmFsaWQtdW50aWw9OTk5OTk5OTk5OTAwMAAABiAjHO+oY0jzCNj0uSNSma7NrhmXFsiPutNILxobLhOkqA==";

test.describe("panels / caveats — satisfy mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.click("[data-testid='caveats-mode-satisfy']");
  });

  test("renders panel with header", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='header-row']")).toContainText("Caveats");
    await expect(page.locator("[data-testid='header-row']")).toContainText(
      "Build caveats, create time limits, and test satisfiers",
    );
    await expect(page.locator("[data-testid='caveats-mode-satisfy']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: macaroon caveats",
    );
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText("exact code");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      "const satisfiers = []",
    );
  });

  test("add valid-until satisfier against token with caveat shows matched result", async ({
    page,
  }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    // valid-until is the default selector; just add it.
    await page.click("[data-testid='satisfy-add-satisfier']");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      "validUntilSatisfier()",
    );
    await page.click("[data-testid='satisfy-run']");

    await expect(page.locator("[data-testid='satisfy-output']")).toBeVisible();
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("valid-until");
  });

  test("checks the shared caveat list without leaving the Caveats panel", async ({ page }) => {
    await page.click("[data-testid='caveats-mode-valid-until']");
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");
    await page.click("[data-testid='expiration-add-to-caveats']");

    await expect(page.locator("[data-testid='caveats-mode-valid-until']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-testid='caveats-output']")).toContainText("valid-until");

    await page.click("[data-testid='caveats-mode-satisfy']");
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: current caveats",
    );
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");

    await expect(page.locator("[data-testid='status-pill']")).toContainText("1/1 matched");
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("matched");
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
