import { expect, test } from "@playwright/test";

test("mocked paid flow advances through protected request states", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "L402 payment flow" })).toBeVisible();
  await expect(page.getByText("Mocked demo")).toBeVisible();
  await expect(page.getByText("No wallet, proxy, or secrets connected")).toBeVisible();

  await page.getByRole("button", { name: /Advance/i }).click();
  await expect(page.getByRole("heading", { name: "402 challenge" })).toBeVisible();
  await expect(page.getByLabel("Mock protocol values").getByText("WWW-Authenticate")).toBeVisible();

  await page.getByRole("button", { name: /Advance/i }).click();
  await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();
  await expect(
    page
      .getByLabel("Mock protocol values")
      .locator("code")
      .filter({ hasText: "sp5examplelonginvoicepayloadforreviewonly" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Advance/i }).click();
  await expect(page.getByRole("heading", { name: "Credential retry" })).toBeVisible();
  await expect(page.getByText("macaroon + preimage")).toBeVisible();

  await page.getByRole("button", { name: /Advance/i }).click();
  await expect(page.getByRole("heading", { name: "Pokedex response" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "pikachu" })).toBeVisible();
  await expect(
    page.getByText("Backend credentials and macaroon root keys are not configured."),
  ).toBeVisible();
});
