import { expect, test, type Page } from "@playwright/test";

// A valid macaroon (shared with the validate specs) used as a paste fixture.
const FIXTURE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";
const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const PREIMAGE = "0000000000000000000000000000000000000000000000000000000000000000";

async function macaroonOutput(page: Page): Promise<string> {
  return (await page.locator("[data-testid='caveats-output'] pre").first().textContent()) ?? "";
}

test.describe("panels / caveats", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders header, empty hint, and no satisfier/mode UI", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toContainText("Caveats");
    await expect(page.locator("[data-testid='header-row']")).toContainText("attenuate");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
    await expect(page.locator("[data-testid='caveats-empty-hint']")).toBeVisible();
    // The satisfier framework and the add/check mode tabs are gone.
    await expect(page.locator("[data-testid='caveats-mode-add']")).toHaveCount(0);
    await expect(page.locator("[data-testid='satisfy-run']")).toHaveCount(0);
  });

  test("loads a pasted macaroon and surfaces it as copyable output", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    await expect(page.locator("[data-testid='caveats-output']")).toBeVisible();
    await expect(await macaroonOutput(page)).toBe(FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='status-pill']")).not.toContainText("idle");
  });

  test("accepts a credential and extracts its macaroon", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", `L402 ${FIXTURE_MACAROON}:${PREIMAGE}`);
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    await expect(await macaroonOutput(page)).toBe(FIXTURE_MACAROON);
  });

  test("attenuates with a custom caveat and re-serializes a new macaroon", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    const before = await macaroonOutput(page);

    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");

    await expect(page.locator("[data-testid='caveats-list']")).toContainText("services=pokedex:0");
    await expect(page.locator("[data-testid='caveat-remove-0']")).toBeVisible();

    const after = await macaroonOutput(page);
    // Appending a caveat re-serializes a longer, different macaroon.
    expect(after).not.toBe(before);
    expect(after.length).toBeGreaterThan(before.length);

    await expect(page.locator("[data-testid='code-snippet']")).toContainText("addFirstPartyCaveat");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText("services");
  });

  test("a re-pasted attenuated macaroon shows the caveat as existing (not removable)", async ({
    page,
  }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.fill("[data-testid='caveats-input']", attenuated);
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("services=pokedex:0");
    // It is baked into the macaroon now, so it is "existing" with no remove button.
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("existing");
    await expect(page.locator("[data-testid='caveat-remove-0']")).toHaveCount(0);
  });

  test("adds a time-limit caveat that shows an expiry", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-seconds-input']", "3600");
    await page.click("[data-testid='caveat-add-time-limit']");

    await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("expires");
  });

  test("removes an added caveat", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "origin");
    await page.fill("[data-testid='caveat-value-input']", "example.com");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("origin=example.com");

    await page.click("[data-testid='caveat-remove-0']");
    await expect(page.locator("[data-testid='caveats-list']")).not.toContainText(
      "origin=example.com",
    );
  });

  test("invalid input shows a clear artifact error", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", "this is not a macaroon !!!");
    await expect(page.locator("[data-testid='caveats-input-error']")).toContainText("macaroon");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("missing condition shows an error", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-value-input']", "something");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-error']")).toContainText(
      "Condition is required",
    );
  });

  test("reset clears the input and caveats", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();

    await page.click("[data-testid='caveats-reset']");
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='caveats-empty-hint']")).toBeVisible();
  });

  test("fills a minted macaroon from the Workbench", async ({ page }) => {
    await page.goto("/p/generate");
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    const minted = (
      await page.locator("[data-testid='generate-token-output'] pre").first().textContent()
    )?.trim();
    expect(minted).toBeTruthy();

    await page.getByTestId("nav-link-caveats").click();
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue("");
    await page.click("[data-testid='caveats-fill-macaroon']");
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue(minted ?? "");
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    // Already-filled: the fill button is now disabled.
    await expect(page.locator("[data-testid='caveats-fill-macaroon']")).toBeDisabled();
  });
});
