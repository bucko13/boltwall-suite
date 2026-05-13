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
      "Signing Key",
      "Generate L402 Token",
      "From Challenge",
      "Parse Token",
      "Caveats",
      "Add Expiration",
      "Validate L402",
      "Satisfy L402",
      "Demo",
    ]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("active panel link is highlighted", async ({ page }) => {
    await page.goto("/p/validate");

    const nav = page.getByRole("navigation", { name: "Primary" });
    const activeLink = nav.getByRole("link", { name: "Validate L402" });
    await expect(activeLink).toHaveAttribute("aria-current", "page");
    await expect(activeLink).toHaveCSS("color", /rgb/);
  });

  test("theme toggle visible in nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-testid='theme-toggle']")).toBeVisible();
  });

  test("meta links point to the L402 spec and project GitHub", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "spec" })).toHaveAttribute(
      "href",
      "https://github.com/lightninglabs/L402/blob/master/protocol-specification.md",
    );
    await expect(nav.getByRole("link", { name: "github" })).toHaveAttribute(
      "href",
      "https://github.com/bucko13/boltwall-suite",
    );
  });

  test("renders package-manifest versions and commit fallback provenance in the footer", async ({
    page,
  }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByTestId("build-provenance")).toHaveCount(0);

    const provenance = page.getByRole("contentinfo", { name: "Build provenance" });
    await expect(provenance).toBeVisible();
    await expect(page.getByTestId("provenance-l402")).toContainText("@boltwall/l402");
    await expect(page.getByTestId("provenance-l402-version")).toHaveText("v0.0.0");
    await expect(page.getByTestId("provenance-l402-commit")).toHaveText(/^([0-9a-f]{7}|local)$/);
    await expect(page.getByTestId("provenance-playground")).toContainText("playground");
    await expect(page.getByTestId("provenance-playground-version")).toHaveText("v0.0.0");
    await expect(page.getByTestId("provenance-playground-commit")).toHaveText(
      /^([0-9a-f]{7}|local)$/,
    );
  });

  test("no tagline copy present", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Read, build, break")).not.toBeVisible();
    // "playground" as page title metadata is fine; only hero tagline copy is forbidden
    await expect(page.getByRole("heading", { name: "L402 playground" })).not.toBeVisible();
  });
});
