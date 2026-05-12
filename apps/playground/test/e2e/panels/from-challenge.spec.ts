import { expect, test } from "@playwright/test";

// From challenges/spec-examples SPEC_EXAMPLE_MACAROON + SPEC_EXAMPLE_INVOICE
const FIXTURE_HEADER =
  'L402 macaroon="AGIAJEemVQUTEyNCR0exk7ek90Cg==", invoice="lnbc1500n1pw5kjhmpp5fu6xhthlt2vucmzkx6c7wtlh2r625r30cyjsfqhu8rsx4xpz5lwqdpa2fjkzep6yptksct5yp5hxgrrv96hx6twvusycn3qv9jx7ur5d9hkugr5dusx6cqzpgxqr23s79ruapxc4j5uskt4htly2salw4drq979d7rcela9wz02elhypmdzmzlnxuknpgfyfm86pntt8vvkvffma5qc9n50h4mvqhngadqy3ngqjcym5a"';

test.describe("panels / from-challenge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/from-challenge");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
  });

  test("parses L402 challenge header and shows scheme + macaroon", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await page.click("[data-testid='challenge-parse']");

    await expect(page.locator("[data-testid='challenge-output']")).toBeVisible();
    await expect(page.locator("[data-testid='challenge-scheme']")).toContainText("L402");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("1 challenge");
  });

  test("invalid header shows error", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", "Bearer not-l402");
    await page.click("[data-testid='challenge-parse']");
    await expect(page.locator("[data-testid='challenge-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await page.click("[data-testid='challenge-parse']");
    await expect(page.locator("[data-testid='challenge-output']")).toBeVisible();
    await page.click("[data-testid='challenge-reset']");
    await expect(page.locator("[data-testid='challenge-output']")).not.toBeVisible();
  });

  test("code snippet reflects input value", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      `const header = ${JSON.stringify(FIXTURE_HEADER)}`,
    );
  });
});
