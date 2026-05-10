import { expect, test } from "@playwright/test";

test("playground exposes an editable L402 learning workflow", async ({ page }) => {
  await page.route("**/api/protected/pokedex", async (route) => {
    await route.fulfill({
      status: 402,
      headers: {
        "www-authenticate":
          'L402 macaroon="AgEDbHRuYndhbGwCCm5ld19jaGFsbGVuZ2U=", invoice="lnbc2500n1ptest"',
      },
      body: JSON.stringify({ error: "payment required" }),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "L402 playground" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Challenge" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Credential" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protected endpoint" })).toBeVisible();

  await expect(page.getByLabel("Parsed challenge fields").getByText("LSAT")).toBeVisible();

  await page.getByLabel("Preimage").fill("abcdef");
  await expect(page.getByLabel("Authorization")).toContainText(":abcdef");

  await page.getByRole("button", { name: "Request endpoint" }).click();
  await expect(page.getByText("HTTP 402. Challenge loaded into the editor.")).toBeVisible();
  await expect(page.getByLabel("Parsed challenge fields").getByText("L402")).toBeVisible();
});
