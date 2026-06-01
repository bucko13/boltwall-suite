import { expect, test } from "@playwright/test";

const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test.describe("panels / generate (GenerateL402Token)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/generate");
    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
  });

  test("renders a single Generate card with header and idle status", async ({ page }) => {
    // The standalone Signing Key card was folded into Generate: one card, one pill.
    await expect(page.locator("[data-testid='cell']")).toHaveCount(1);
    await expect(page.locator("[data-testid='header-row']").first()).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("idle");
  });

  test("Generate key button fills the root key input and stages the Workbench key", async ({
    page,
  }) => {
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("empty");

    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(
      /^[0-9a-f]{64}$/,
    );
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");
  });

  test("pasting a valid root key stages the Workbench signing key", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");
  });

  test("root key + empty invoice mints a macaroon (random paymentHash)", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.getByRole("group", { name: "Generated macaroon" })).toBeVisible();
    await expect(page.locator("[data-testid='generate-token-output'] input")).toHaveCount(0);
    await expect(page.locator("[data-testid='generate-token-output'] textarea")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("minted");
  });

  test("invalid key shows error", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", "tooshort");
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("error");
  });

  test("generating a key clears a stale missing-key mint error", async ({ page }) => {
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-error']")).toContainText(
      "Paste a 64-char hex root key.",
    );
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("error");

    await page.click("[data-testid='signing-key-generate']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(
      /^[0-9a-f]{64}$/,
    );
    await expect(page.locator("[data-testid='generate-token-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("idle");
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
  });

  test("editing an input clears local output but keeps the minted macaroon in Workbench", async ({
    page,
  }) => {
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    // Editing the invoice clears the local view of the mint...
    await page.fill("[data-testid='generate-token-invoice-input']", "lnbc1");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
    // ...but the Workbench still holds the last successful mint (bug #21 fix).
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );
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
