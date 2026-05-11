import { expect, test } from "@playwright/test";

// Panel routing assertions deferred to bw-0dw.2 (routes don't exist until panels land).
test.describe("Nav shell", () => {
  test("beaker logo present on every route", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-testid='beaker-logo']")).toBeVisible();

    await page.goto("/design");
    await expect(page.locator("[data-testid='beaker-logo']").first()).toBeVisible();
  });

  test("all 9 panel links present", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const label of [
      "signing key",
      "from invoice",
      "from challenge",
      "parse token",
      "caveats",
      "expiration",
      "validate",
      "satisfy",
      "demo",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("theme toggle visible in nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-testid='theme-toggle']")).toBeVisible();
  });

  test("no tagline copy present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Read, build, break")).not.toBeVisible();
    // "playground" as page title metadata is fine; only hero tagline copy is forbidden
    await expect(page.getByRole("heading", { name: "L402 playground" })).not.toBeVisible();
  });
});
