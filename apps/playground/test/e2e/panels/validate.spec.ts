import { expect, test } from "@playwright/test";

const FIXTURE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";
const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const WRONG_PREIMAGE = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// Matched pair (zero-preimage-canonical): sha256(ZERO_PREIMAGE) is this
// macaroon's payment hash, so the preimage check passes. Used to exercise the
// no-root-key path where only the signature stays unverified.
const MATCHED_MACAROON =
  "AgJCAABmaHqt+GK9d2yPwYuOn44gCJcUhW7iM7OQKlkdDV8pJUJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCAAAGIH9hp+uMItiKi8tWoZlifmqpAXGfIYkWOdhGLJw3aWRR";
const ZERO_PREIMAGE = "0000000000000000000000000000000000000000000000000000000000000000";

test.describe("panels / validate", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/validate");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders panel with header and idle status", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='header-row']")).toContainText("Validate L402");
    await expect(page.locator("[data-testid='header-row']")).toContainText(
      "Verify signature, preimage, and caveats",
    );
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
  });

  test("verify with mismatched preimage shows check results including preimage row", async ({
    page,
  }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", FIXTURE_KEY);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Preimage matches paymentHash",
    );
    await expect(page.locator("[data-testid='status-pill']")).toContainText("invalid");
  });

  test("verify accepts a full Authorization credential", async ({ page }) => {
    await page.fill(
      "[data-testid='validate-token-input']",
      `Authorization: L402 ${FIXTURE_MACAROON}:${WRONG_PREIMAGE}`,
    );
    await page.fill("[data-testid='validate-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Preimage matches paymentHash",
    );
    await expect(page.locator("[data-testid='status-pill']")).toContainText("invalid");
  });

  test("credential checks do not dead-end without a root key", async ({ page }) => {
    await page.fill(
      "[data-testid='validate-token-input']",
      `Authorization: L402 ${FIXTURE_MACAROON}:${WRONG_PREIMAGE}`,
    );
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Identifier decoded",
    );
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Preimage matches paymentHash",
    );
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Macaroon signature not checked",
    );
  });

  test("credential without a root key reads as partially verified, not valid", async ({ page }) => {
    await page.fill(
      "[data-testid='validate-token-input']",
      `L402 ${MATCHED_MACAROON}:${ZERO_PREIMAGE}`,
    );
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Macaroon signature not checked",
    );
    await expect(page.locator("[data-testid='validate-output']")).toContainText("SKIPPED");
    // The signature is unverified without the root key — not green/"valid".
    await expect(page.locator("[data-testid='status-pill']")).toContainText("partially verified");
  });

  test("tamper button flips last byte and shows tampered indicator", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", FIXTURE_KEY);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);

    await page.click("[data-testid='validate-tamper']");

    await expect(page.locator("text=Token tampered")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Macaroon signature valid",
    );
  });

  test("empty token shows error", async ({ page }) => {
    await page.fill("[data-testid='validate-key-input']", FIXTURE_KEY);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-error']")).toBeVisible();
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-key-input']", FIXTURE_KEY);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await page.click("[data-testid='validate-reset']");
    await expect(page.locator("[data-testid='validate-output']")).not.toBeVisible();
  });

  test("saved macaroon and signing key are filled from Workbench explicitly", async ({ page }) => {
    await page.goto("/p/generate");
    await page.fill("[data-testid='signing-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("00010203");

    await page.getByRole("link", { name: "Generate" }).click();
    // Generate inputs are local now; load the signing key from the Workbench.
    await page.click("[data-testid='generate-token-fill-key']");
    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    const macaroon = await page.locator("[data-testid='generate-token-output'] pre").textContent();
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );

    await page.getByTestId("nav-link-parse").click();
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );

    await page.getByTestId("nav-link-caveats").click();
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );

    await page.getByTestId("nav-link-demo").click();
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );

    await page.getByRole("link", { name: "Validate" }).click();
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await page.click("[data-testid='validate-fill-key']");
    await page.click("[data-testid='validate-fill-macaroon']");
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveValue(FIXTURE_KEY);
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue(
      macaroon?.trim() ?? "",
    );

    await page.click("[data-testid='validate-reset']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      macaroon?.slice(0, 8) ?? "",
    );
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText("00010203");

    await page.click("[data-testid='validate-fill-macaroon']");
    await page.click("[data-testid='validate-fill-key']");
    await page.click("[data-testid='validate-clear-both']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "macaroon: empty",
    );
    await expect(page.locator("[data-testid='workbench-memory-key']")).toContainText(
      "signing key: empty",
    );
  });
});
