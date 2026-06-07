import { expect, type Page, test } from "@playwright/test";

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
const MATCHED_CREDENTIAL = `L402 ${MATCHED_MACAROON}:${ZERO_PREIMAGE}`;
const MATCHED_CHALLENGE = `L402 macaroon="${MATCHED_MACAROON}", invoice=""`;

async function seedWorkbenchSigningKey(page: Page) {
  await page.goto("/p/generate");
  await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
  await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");
  await page.goto("/p/validate");
  await expect(page.locator("[data-testid='cell']")).toBeVisible();
  await expect(page.locator("[data-testid='validate-workbench-signing-key']")).toContainText(
    "Workbench signing key",
  );
}

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

  test("Workbench fill controls use concise labels with accessible state", async ({ page }) => {
    const actions = page.getByTestId("validate-workbench-actions");
    await expect(actions).toContainText("Use from Workbench");
    await expect(actions).not.toContainText("Fill macaroon from workbench");
    await expect(page.getByTestId("validate-fill-macaroon")).toHaveText("Macaroon");
    await expect(page.getByTestId("validate-fill-credential")).toHaveText("Credential");
    await expect(page.getByTestId("validate-fill-key")).toHaveCount(0);
    await expect(page.getByTestId("validate-key-input")).toHaveCount(0);
    await expect(page.getByTestId("validate-workbench-signing-key")).toContainText(
      "not in Workbench",
    );
  });

  test("verify with mismatched preimage shows check results including preimage row", async ({
    page,
  }) => {
    await seedWorkbenchSigningKey(page);
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Preimage matches paymentHash",
    );
    await expect(page.locator("[data-testid='status-pill']")).toContainText("invalid");
  });

  test("verify accepts a full Authorization credential", async ({ page }) => {
    await seedWorkbenchSigningKey(page);
    await page.fill(
      "[data-testid='validate-token-input']",
      `Authorization: L402 ${FIXTURE_MACAROON}:${WRONG_PREIMAGE}`,
    );
    await page.click("[data-testid='validate-verify']");

    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Preimage matches paymentHash",
    );
    await expect(page.locator("[data-testid='status-pill']")).toContainText("invalid");
  });

  test("credential checks do not dead-end without a Workbench signing key", async ({ page }) => {
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

  test("macaroon-only verification skips missing preimage and signing key", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", MATCHED_MACAROON);
    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(page.locator("[data-testid='validate-error']")).toHaveCount(0);
    await expect(output).toBeVisible();
    await expect(output).toContainText("Identifier decoded");
    await expect(output).toContainText("Preimage check skipped");
    await expect(output).toContainText("Macaroon signature not checked");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("partially verified");
  });

  test("signature check uses the Workbench signing key when present", async ({ page }) => {
    await seedWorkbenchSigningKey(page);
    await expect(page.getByTestId("validate-workbench-signing-key")).toContainText(
      "Workbench signing key",
    );
    await page.fill("[data-testid='validate-token-input']", MATCHED_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", ZERO_PREIMAGE);
    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(output).toContainText("Preimage matches paymentHash");
    await expect(output).toContainText("Macaroon signature and caveats valid");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("valid");
  });

  test("macaroon plus matching preimage emits a credential and stages it", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", MATCHED_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", ZERO_PREIMAGE);

    const credential = page.getByTestId("validate-generated-credential");
    await expect(credential).toBeVisible();
    await expect(credential).toContainText(MATCHED_CREDENTIAL);

    await page.click("[data-testid='validate-add-credential-workbench']");
    await expect(page.getByTestId("validate-workbench-status")).toContainText(
      "Credential added to Workbench",
    );
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );
    await expect(page.locator("[data-testid='workbench-memory-credential-status']")).toHaveText(
      "stored",
    );
  });

  test("challenge plus matching preimage stages the credential and preserves challenge context", async ({
    page,
  }) => {
    await page.fill("[data-testid='validate-token-input']", MATCHED_CHALLENGE);
    await page.fill("[data-testid='validate-preimage-input']", ZERO_PREIMAGE);
    await expect(page.getByTestId("validate-generated-credential")).toContainText(
      MATCHED_CREDENTIAL,
    );

    await page.click("[data-testid='validate-add-credential-workbench']");
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge-status']")).toHaveText(
      "stored",
    );
    await expect(page.locator("[data-testid='workbench-memory-credential-status']")).toHaveText(
      "stored",
    );
  });

  test("invalid preimage and existing credentials do not expose duplicate credential output", async ({
    page,
  }) => {
    await page.fill("[data-testid='validate-token-input']", MATCHED_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await expect(page.getByTestId("validate-generated-credential")).toHaveCount(0);

    await page.fill("[data-testid='validate-token-input']", MATCHED_CREDENTIAL);
    await page.fill("[data-testid='validate-preimage-input']", "");
    await expect(page.getByTestId("validate-generated-credential")).toHaveCount(0);
  });

  test("malformed preimage is skipped instead of blocking verification", async ({ page }) => {
    await seedWorkbenchSigningKey(page);
    await page.fill("[data-testid='validate-token-input']", MATCHED_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", "abc");
    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(page.locator("[data-testid='validate-error']")).toHaveCount(0);
    await expect(output).toContainText("Preimage check skipped");
    await expect(output).toContainText("Macaroon signature and caveats valid");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("partially verified");
  });

  test("credential without a Workbench signing key reads as partially verified, not valid", async ({
    page,
  }) => {
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
    // The signature is unverified without the Workbench signing key — not green/"valid".
    await expect(page.locator("[data-testid='status-pill']")).toContainText("partially verified");
  });

  test("pasted credentials prefill the preimage input", async ({ page }) => {
    await page.fill("[data-testid='validate-token-input']", MATCHED_CREDENTIAL);
    await expect(page.locator("[data-testid='validate-preimage-input']")).toHaveValue(
      ZERO_PREIMAGE,
    );
  });

  test("Workbench credential fill also prefills the preimage input", async ({ page }) => {
    await page.goto("/p/generate");
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.fill("[data-testid='generate-token-preimage-input']", ZERO_PREIMAGE);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='workbench-memory-credential-status']")).toHaveText(
      "stored",
    );

    await page.goto("/p/validate");
    await page.click("[data-testid='validate-fill-credential']");
    await expect(page.locator("[data-testid='validate-preimage-input']")).toHaveValue(
      ZERO_PREIMAGE,
    );
  });

  test("tamper button flips last byte and shows tampered indicator", async ({ page }) => {
    await seedWorkbenchSigningKey(page);
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);

    await page.click("[data-testid='validate-tamper']");

    await expect(page.locator("text=Token tampered")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await expect(page.locator("[data-testid='validate-output']")).toContainText(
      "Macaroon signature and caveats valid",
    );
  });

  test("empty token shows error", async ({ page }) => {
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-error']")).toBeVisible();
  });

  test("reset clears output", async ({ page }) => {
    await seedWorkbenchSigningKey(page);
    await page.fill("[data-testid='validate-token-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='validate-preimage-input']", WRONG_PREIMAGE);
    await page.click("[data-testid='validate-verify']");
    await expect(page.locator("[data-testid='validate-output']")).toBeVisible();
    await page.click("[data-testid='validate-reset']");
    await expect(page.locator("[data-testid='validate-output']")).not.toBeVisible();
  });

  test("minted macaroon persists across panels via Workbench memory", async ({ page }) => {
    await page.goto("/p/generate");
    // The merged Generate card's single key input both mints and stages the
    // Workbench signing key (producer role).
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");

    await page.click("[data-testid='generate-token-mint']");
    const macaroon = await page.locator("[data-testid='generate-token-output'] pre").textContent();
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.getByTestId("nav-link-parse").click();
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.getByTestId("nav-link-caveats").click();
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.getByTestId("nav-link-demo").click();
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );

    await page.getByRole("link", { name: "Validate" }).click();
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveCount(0);
    await expect(page.locator("[data-testid='validate-workbench-signing-key']")).toContainText(
      "Workbench signing key",
    );
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await page.click("[data-testid='validate-fill-macaroon']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue(
      macaroon?.trim() ?? "",
    );

    await page.click("[data-testid='validate-reset']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "stored",
    );
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("stored");

    await page.click("[data-testid='validate-fill-macaroon']");
    await expect(page.locator("[data-testid='validate-fill-macaroon']")).toHaveAttribute(
      "aria-label",
      "Macaroon already filled",
    );
    await page.click("[data-testid='validate-clear-both']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveCount(0);
    await expect(page.locator("[data-testid='workbench-memory-macaroon-status']")).toHaveText(
      "empty",
    );
    await expect(page.locator("[data-testid='workbench-memory-key-status']")).toHaveText("empty");
  });
});
