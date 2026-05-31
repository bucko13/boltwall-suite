import { expect, type Page, test } from "@playwright/test";

const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

async function expectNoPageHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("responsive layout", () => {
  test("mobile navigation uses a drawer and keeps every panel reachable", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/p/validate");

    const nav = page.locator("nav[aria-label='Primary']");
    await expect(nav).toBeVisible();
    await expect(page.locator("[data-testid='nav-link-validate']")).not.toBeVisible();

    await page.getByTestId("mobile-nav-open").click();
    const drawer = page.getByTestId("mobile-nav-drawer");
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId("mobile-nav-link-validate")).toHaveAttribute(
      "aria-current",
      "page",
    );
    for (const testId of [
      "mobile-nav-link-generate",
      "mobile-nav-link-parse",
      "mobile-nav-link-caveats",
      "mobile-nav-link-validate",
      "mobile-nav-link-demo",
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
    await expect(drawer.locator("[data-testid^='mobile-nav-sublink-']")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(drawer).not.toBeVisible();

    await page.getByTestId("mobile-nav-open").click();
    await page.getByTestId("mobile-nav-link-parse").click();
    await expect(page).toHaveURL(/\/p\/parse/);
    await expect(page.getByTestId("mobile-nav-drawer")).not.toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });

  test("mobile panel headers reflow controls without clipping content", async ({ page }) => {
    await page.setViewportSize(MOBILE);

    for (const route of ["/p/generate", "/p/validate", "/p/caveats"]) {
      await page.goto(route);
      await expect(page.locator("[data-testid='header-row']").first()).toBeVisible();
      await expect(page.locator("[data-testid='status-pill']").first()).toBeVisible();
      await expectNoPageHorizontalOverflow(page);
    }
  });

  test("mobile home groups and code snippets stay readable without page overflow", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "L402 Workbench" })).toBeVisible();
    await expect(page.locator("[data-testid^='home-group-']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='panel-link-']")).toHaveCount(5);
    const homeGridColumns = await page
      .locator(".home-panel-grid")
      .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length);
    expect(homeGridColumns).toBe(1);
    await expectNoPageHorizontalOverflow(page);

    await page.goto("/p/parse");
    await expect(page.locator("[data-testid='code-snippet']").first()).toBeVisible();
    await expect(page.locator("[data-testid='code-snippet-copy']").first()).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });

  test("desktop layout keeps the compact horizontal navigation", async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto("/p/caveats");

    const nav = page.locator("nav[aria-label='Primary']");
    const navBox = await nav.boundingBox();
    expect(navBox?.height).toBeLessThan(80);
    await expect(page.locator("[data-testid='nav-link-caveats']")).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("mobile-nav-open")).not.toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });
});
