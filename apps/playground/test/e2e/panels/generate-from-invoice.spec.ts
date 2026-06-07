/**
 * GenerateL402Token panel — fixture-driven e2es.
 *
 * Uses BOLT 11 invoice from @boltwall/test-fixtures. Fills the panel with a
 * fixture invoice + a known signing key, mints, and asserts the output macaroon
 * decodes to an identifier whose paymentHash matches the fixture. Also covers
 * the full-challenge emission (macaroon + invoice) and its handoff into the
 * Parse panel via Workbench memory, plus credential emission (macaroon +
 * preimage) and its end-to-end verification in the Validate panel.
 */
import { expect, test, type Page } from "@playwright/test";

import { BOLT11_SPEC_EXAMPLES } from "@boltwall/test-fixtures";

import { setTheme } from "../setup";

const invoiceFixture = BOLT11_SPEC_EXAMPLES.find((f) => f.name === "bolt11-spec-microbtc-mainnet");
if (!invoiceFixture) {
  throw new Error("generate-from-invoice: missing bolt11-spec-microbtc-mainnet fixture");
}

// Arbitrary known signing key — 32 bytes.
const SIGNING_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
// Arbitrary 32-byte hex preimage; Generate binds the macaroon to sha256 of it.
const PREIMAGE = "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100";
const WORKBENCH_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";
const WORKBENCH_CHALLENGE = `L402 macaroon="${WORKBENCH_MACAROON}", invoice="${invoiceFixture.invoice}"`;
const WORKBENCH_CREDENTIAL = `L402 ${WORKBENCH_MACAROON}:${PREIMAGE}`;

async function seedWorkbenchMemory(
  page: Page,
  memory: Partial<Record<"signingKey" | "macaroon" | "challenge" | "credential", string>>,
) {
  const snapshot = { signingKey: "", macaroon: "", challenge: "", credential: "", ...memory };
  await page.evaluate((value) => {
    window.sessionStorage.setItem("bw.workbench-memory", JSON.stringify(value));
  }, snapshot);
  await page.reload();
  await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
}

test.describe("panels / generate-from-invoice", () => {
  test.beforeEach(async ({ page }) => {
    await setTheme(page, "light");
    await page.goto("/p/generate");
    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
  });

  test("minting with fixture invoice produces a base64 macaroon output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");

    const output = page.locator("[data-testid='generate-token-output']");
    await expect(output).toBeVisible();
    // Output must contain a non-trivial base64 string.
    const text = await output.textContent();
    expect(text?.replace(/\s/g, "").length).toBeGreaterThan(20);
  });

  test("code-snippet updates when invoice input changes", async ({ page }) => {
    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(snippet).toBeVisible();

    // Type a portion of the invoice and check it appears in the snippet.
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await expect(snippet).toContainText(invoiceFixture.invoice.slice(0, 8), { timeout: 200 });
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "recipe code",
    );
  });

  test("Workbench fill controls are compact and disabled when empty", async ({ page }) => {
    const actions = page.getByTestId("generate-workbench-actions");
    await expect(actions).toContainText("Use from Workbench");
    await expect(page.getByTestId("generate-fill-signing-key")).toHaveText("Signing key");
    await expect(page.getByTestId("generate-fill-invoice")).toHaveText("Invoice");
    await expect(page.getByTestId("generate-fill-preimage")).toHaveText("Preimage");
    await expect(page.getByTestId("generate-fill-signing-key")).toBeDisabled();
    await expect(page.getByTestId("generate-fill-invoice")).toBeDisabled();
    await expect(page.getByTestId("generate-fill-preimage")).toBeDisabled();
  });

  test("fills Generate inputs from matching Workbench artifacts", async ({ page }) => {
    await seedWorkbenchMemory(page, {
      signingKey: SIGNING_KEY,
      challenge: WORKBENCH_CHALLENGE,
      credential: WORKBENCH_CREDENTIAL,
    });

    await page.click("[data-testid='generate-fill-signing-key']");
    await page.click("[data-testid='generate-fill-invoice']");
    await page.click("[data-testid='generate-fill-preimage']");

    await expect(page.locator("[data-testid='generate-token-key-input']")).toHaveValue(SIGNING_KEY);
    await expect(page.locator("[data-testid='generate-token-invoice-input']")).toHaveValue(
      invoiceFixture.invoice,
    );
    await expect(page.locator("[data-testid='generate-token-preimage-input']")).toHaveValue(
      PREIMAGE,
    );
    await expect(page.getByTestId("generate-fill-signing-key")).toHaveAttribute(
      "aria-label",
      "Signing key already filled",
    );
  });

  test("minting with invoice switches snippet to exact generated identifier", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");

    const snippet = page.locator("[data-testid='code-snippet']").first();
    await expect(page.locator("[data-testid='code-snippet-contract']").first()).toContainText(
      "exact code",
    );
    await expect(snippet).toContainText("paymentHash: hexToBytes(");
    await expect(snippet).toContainText("tokenId: hexToBytes(");
    await expect(snippet).not.toContainText("decodeBolt11Invoice");
  });

  test("reset clears invoice input and output", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();

    await page.click("[data-testid='generate-token-reset']");
    await expect(page.locator("[data-testid='generate-token-output']")).not.toBeVisible();
  });

  test("minting with an invoice emits a full WWW-Authenticate challenge", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");

    const challenge = page.locator("[data-testid='generate-token-challenge']");
    await expect(challenge).toBeVisible();
    const text = (await challenge.textContent()) ?? "";
    // Dual emission: legacy LSAT first, then current L402, both carrying the invoice.
    expect(text).toContain("LSAT macaroon=");
    expect(text).toContain("L402 macaroon=");
    expect(text).toContain(invoiceFixture.invoice.slice(0, 12));

    // The exact snippet now teaches the class-forward challenge-construction call.
    await expect(page.locator("[data-testid='code-snippet']").first()).toContainText(
      "toAuthenticateHeaders",
    );
  });

  test("minting without an invoice mints a macaroon but no challenge", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='generate-token-challenge']")).not.toBeVisible();
  });

  test("generated challenge hands off to Parse via Workbench memory", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-challenge']")).toBeVisible();

    // Workbench memory persists across navigation; Parse loads it via Fill.
    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue("");
    await page.click("[data-testid='parse-token-fill-challenge']");
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(/L402 macaroon=/);

    await page.click("[data-testid='parse-token-decode']");
    await expect(page.locator("[data-testid='parse-token-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='parse-token-invoice']")).toContainText(
      invoiceFixture.invoice.slice(0, 12),
    );
  });

  test("minting with a preimage emits an Authorization credential", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-preimage-input']", PREIMAGE);
    await page.click("[data-testid='generate-token-mint']");

    const credential = page.locator("[data-testid='generate-token-credential']");
    await expect(credential).toBeVisible();
    const text = (await credential.textContent()) ?? "";
    expect(text).toContain("L402 ");
    expect(text).toContain(PREIMAGE);

    // No invoice supplied, so there is no challenge — only the credential.
    await expect(page.locator("[data-testid='generate-token-challenge']")).not.toBeVisible();
    // The exact snippet teaches the credential-construction call.
    await expect(page.locator("[data-testid='code-snippet']").first()).toContainText(
      "toAuthorizationHeader",
    );
  });

  test("minting without a preimage mints no credential", async ({ page }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-invoice-input']", invoiceFixture.invoice);
    await page.click("[data-testid='generate-token-mint']");

    await expect(page.locator("[data-testid='generate-token-output']")).toBeVisible();
    await expect(page.locator("[data-testid='generate-token-credential']")).not.toBeVisible();
  });

  test("generated credential verifies in Validate with the Workbench signing key", async ({
    page,
  }) => {
    await page.fill("[data-testid='generate-token-key-input']", SIGNING_KEY);
    await page.fill("[data-testid='generate-token-preimage-input']", PREIMAGE);
    await page.click("[data-testid='generate-token-mint']");
    await expect(page.locator("[data-testid='generate-token-credential']")).toBeVisible();

    // The mint already staged the signing key into the Workbench (producer role),
    // so Validate can read it directly — carry it + the credential into Validate.
    await page.goto("/p/validate");
    await page.click("[data-testid='validate-fill-credential']");
    await expect(page.locator("[data-testid='validate-key-input']")).toHaveCount(0);
    await expect(page.locator("[data-testid='validate-workbench-signing-key']")).toContainText(
      "Workbench signing key",
    );

    await page.click("[data-testid='validate-verify']");

    const output = page.locator("[data-testid='validate-output']");
    await expect(output).toBeVisible();
    await expect(output).toContainText("Preimage matches paymentHash");
    // Signature + preimage + caveats all pass → overall valid.
    await expect(page.locator("[data-testid='status-pill']").first()).toContainText("valid");
  });
});
