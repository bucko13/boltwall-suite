import { expect, test } from "@playwright/test";

// From challenges/spec-examples SPEC_EXAMPLE_MACAROON + SPEC_EXAMPLE_INVOICE
const FIXTURE_HEADER =
  'L402 macaroon="AGIAJEemVQUTEyNCR0exk7ek90Cg==", invoice="lnbc1500n1pw5kjhmpp5fu6xhthlt2vucmzkx6c7wtlh2r625r30cyjsfqhu8rsx4xpz5lwqdpa2fjkzep6yptksct5yp5hxgrrv96hx6twvusycn3qv9jx7ur5d9hkugr5dusx6cqzpgxqr23s79ruapxc4j5uskt4htly2salw4drq979d7rcela9wz02elhypmdzmzlnxuknpgfyfm86pntt8vvkvffma5qc9n50h4mvqhngadqy3ngqjcym5a"';

test.describe("panels / from-challenge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']").first()).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("idle");
  });

  test("parses L402 challenge header and shows scheme + macaroon", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await page.click("[data-testid='challenge-parse']");

    await expect(page.locator("[data-testid='challenge-output']")).toBeVisible();
    await expect(page.locator("[data-testid='challenge-output']")).toContainText(
      "Parsed challenge fields",
    );
    await expect(page.locator("[data-testid='challenge-scheme']")).toContainText("L402");
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("1 challenge");
    await expect(page.locator("[data-testid='challenge-next-actions']")).toContainText(
      "Remembered parts",
    );
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText("AGIA");
    await expect(page.locator("[data-testid='challenge-store-macaroon']")).toHaveCount(0);
    await expect(page.locator("[data-testid='challenge-use-parse-token']")).toHaveCount(0);
    await expect(page.locator("[data-testid='challenge-copy-invoice']")).toContainText(
      "Copy invoice",
    );
  });

  test("parsing a challenge remembers its macaroon for the parser", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await page.click("[data-testid='challenge-parse']");

    const macaroon = await page.locator("[data-testid='challenge-macaroon']").textContent();
    await expect(page.locator("[data-testid='challenge-next-action-status']")).toContainText(
      "Macaroon is stored",
    );

    await page.getByTestId("nav-link-parse").click();
    await expect(page).toHaveURL(/\/p\/parse/);
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await page.click("[data-testid='parse-token-fill-macaroon']");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(
      /AGIAJEemVQUTEyNCR0exk7ek90Cg==/,
    );
    expect(macaroon).toContain("AGIA");
  });

  test("invalid header shows error", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", "Bearer not-l402");
    await page.click("[data-testid='challenge-parse']");
    await expect(page.locator("[data-testid='challenge-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("error");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await page.click("[data-testid='challenge-parse']");
    await expect(page.locator("[data-testid='challenge-output']")).toBeVisible();
    await page.click("[data-testid='challenge-reset']");
    await expect(page.locator("[data-testid='challenge-output']")).not.toBeVisible();
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText(
      "challenge: empty",
    );
  });

  test("code snippet reflects input value", async ({ page }) => {
    await page.fill("[data-testid='challenge-input']", FIXTURE_HEADER);
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "current input code",
    );
    await expect(page.locator("[data-testid='code-snippet']").first()).toContainText(
      `const header = ${JSON.stringify(FIXTURE_HEADER)}`,
    );
  });
});
