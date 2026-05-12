import { expect, test } from "@playwright/test";

// Home page is now the design-system landing page (bw-0dw.1).
// Full workbench panels land in bw-0dw.2+.
test("home page renders and links to /design", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "L402 Workbench" })).toBeVisible();
  await expect(page.getByRole("link", { name: /signing key/i }).first()).toBeVisible();
});
