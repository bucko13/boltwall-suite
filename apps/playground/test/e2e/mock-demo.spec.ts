import { expect, test } from "@playwright/test";

// Home page currently routes through the design-system landing page.
// Full workbench panels are covered by dedicated panel specs.
test("home page renders and links to /design", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "L402 Workbench" })).toBeVisible();
  await expect(page.getByTestId("panel-link-generate")).toBeVisible();
  await expect(page.getByTestId("panel-link-parse")).toBeVisible();
});
