import { expect, test } from "@playwright/test";

// Panel routing assertions deferred to bw-0dw.2 (routes don't exist until panels land).
test.describe("Nav shell", () => {
  test("beaker logo present on every route", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-testid='beaker-logo']")).toBeVisible();

    await page.goto("/design");
    await expect(page.locator("[data-testid='beaker-logo']").first()).toBeVisible();
  });

  test("intent-oriented nav groups expose every panel", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    for (const label of ["Generate", "Parse", "Caveats", "Validate", "Demo"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await page.getByTestId("nav-link-generate").hover();
    await expect(page.getByTestId("nav-sublink-signing-key")).toBeVisible();
    await expect(page.getByTestId("nav-sublink-from-invoice")).toContainText("Generate Token");

    await page.getByTestId("nav-link-parse").hover();
    await expect(page.getByTestId("nav-sublink-from-challenge")).toContainText("Challenge Header");
    await expect(page.getByTestId("nav-sublink-parse-token")).toContainText("Token");

    await expect(nav.getByRole("link", { name: "Generate L402 Token" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Validate L402" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Caveat Builder" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Valid-until Caveat" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Caveat Satisfiers" })).toHaveCount(0);
  });

  test("homepage follows the same grouped IA as production navigation", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("[data-testid^='home-group-']")).toHaveCount(5);
    for (const group of ["generate", "parse", "caveats", "validate", "demo"]) {
      await expect(page.getByTestId(`home-group-${group}`)).toBeVisible();
    }

    for (const slug of [
      "signing-key",
      "from-invoice",
      "from-challenge",
      "parse-token",
      "caveats",
      "validate",
      "demo",
    ]) {
      await expect(page.getByTestId(`panel-link-${slug}`)).toBeVisible();
    }

    await expect(page.locator("[data-testid^='panel-link-']")).toHaveCount(7);
    await expect(page.getByTestId("home-group-signing-key")).toHaveCount(0);
    await expect(page.getByTestId("home-group-from-invoice")).toHaveCount(0);
    await expect(page.getByTestId("home-group-from-challenge")).toHaveCount(0);
    await expect(page.getByTestId("home-group-parse-token")).toHaveCount(0);
  });

  test("active panel link is highlighted", async ({ page }) => {
    await page.goto("/p/validate");

    const nav = page.getByRole("navigation", { name: "Primary" });
    const activeLink = nav.getByRole("link", { name: "Validate" });
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
