import { expect, test } from "@playwright/test";

const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test.describe("panels / from-invoice (GenerateL402Token)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/generate");
    await expect(page.locator("[data-testid='cell']").nth(1)).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']").nth(1)).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("idle");
  });

  test("Workbench fill control uses concise Key label with accessible state", async ({ page }) => {
    const actions = page.getByTestId("generate-token-workbench-actions");
    await expect(actions).toContainText("Use from Workbench");
    await expect(actions).not.toContainText("Fill key from workbench");
    await expect(page.getByTestId("generate-token-fill-key")).toHaveText("Key");
    await expect(page.getByTestId("generate-token-fill-key")).toHaveAttribute(
      "aria-label",
      "No key in Workbench",
    );
  });

  test("root key + empty invoice mints a macaroon (random paymentHash)", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.getByRole("group", { name: "Generated macaroon" })).toBeVisible();
    await expect(page.locator("[data-testid='generate-token-output'] input")).toHaveCount(0);
    await expect(page.locator("[data-testid='generate-token-output'] textarea")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("minted");
  });

  test("invalid key shows error", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", "tooshort");
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("error");
  });

  test("generated signing key clears a stale missing-key mint error", async ({ page }) => {
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toContainText(
      "Paste a 64-char hex root key.",
    );
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("error");

    await page.click("[data-testid='signing-key-generate']");
    // The signing key is carried via the Workbench; load it into Generate explicitly.
    await page.click("[data-testid='generate-token-fill-key']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(
      /^[0-9a-f]{64}$/,
    );
    await expect(page.locator("[data-testid='generate-token-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']").nth(1)).toContainText("idle");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
  });

  test("code snippet reflects key value", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='code-snippet']").first()).toContainText(
      `const rootKey = hexToBytes("${FIXTURE_KEY}")`,
    );
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "recipe code",
    );
  });

  test("minted code snippet is an exact reproducer without random generation", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "exact code",
    );
    await expect(snippet).toContainText(`const rootKey = hexToBytes("${FIXTURE_KEY}")`);
    await expect(snippet).toContainText("paymentHash: hexToBytes(");
    await expect(snippet).toContainText("tokenId: hexToBytes(");
    await expect(snippet).not.toContainText("getRandomValues");
  });

  test("minted macaroon is available to fill the parse panel from Workbench", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    const macaroon = await page.locator("[data-testid='generate-token-output'] pre").textContent();

    expect(macaroon).toBeTruthy();
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await page.click("[data-testid='parse-token-fill-macaroon']");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(
      macaroon?.trim() ?? "",
    );
  });

  test("clearing remembered macaroon disables Workbench fill for parse", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.click("[data-testid='workbench-memory-macaroon-clear']");
    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='parse-token-fill-macaroon']")).toBeDisabled();
  });

  test("Workbench copy feedback keeps the icon button layout stable", async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });

    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    const chip = page.locator("[data-testid='workbench-memory-macaroon']");
    const copyButton = page.locator("[data-testid='workbench-memory-macaroon-copy']");
    await expect(copyButton).toHaveAttribute("aria-label", "Copy remembered macaroon");
    await expect(copyButton.locator("svg")).toHaveCount(1);

    const beforeButton = await copyButton.boundingBox();
    const beforeChip = await chip.boundingBox();
    expect(beforeButton).toBeTruthy();
    expect(beforeChip).toBeTruthy();

    await copyButton.click();
    await expect(copyButton).toHaveAttribute("aria-label", "Copied remembered macaroon");
    await expect(copyButton.locator("svg")).toHaveCount(1);

    const afterButton = await copyButton.boundingBox();
    const afterChip = await chip.boundingBox();
    expect(afterButton).toBeTruthy();
    expect(afterChip).toBeTruthy();
    expect(Math.abs((afterButton?.width ?? 0) - (beforeButton?.width ?? 0))).toBeLessThan(0.5);
    expect(Math.abs((afterButton?.height ?? 0) - (beforeButton?.height ?? 0))).toBeLessThan(0.5);
    expect(Math.abs((afterChip?.height ?? 0) - (beforeChip?.height ?? 0))).toBeLessThan(0.5);
  });
});
