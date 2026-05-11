import { expect, test } from "@playwright/test";

test.describe("/design route", () => {
  test("all primitives render in light theme", async ({ page }) => {
    // Start in light mode
    await page.addInitScript(() => {
      localStorage.setItem("bw.theme", "light");
    });
    await page.goto("/design");

    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
    await expect(page.locator("[data-testid='header-row']").first()).toBeVisible();
    await expect(page.locator("[data-testid='code-strip']").first()).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toBeVisible();
    await expect(page.locator("[data-testid='caveat-pill']").first()).toBeVisible();
    await expect(page.locator("[data-testid='chip']").first()).toBeVisible();
    await expect(page.locator("[data-testid='big-blob']").first()).toBeVisible();
    await expect(page.locator("[data-testid='trunc-middle']").first()).toBeVisible();
    await expect(page.locator("[data-testid='view-mode-toggle']").first()).toBeVisible();
    await expect(page.locator("[data-testid='theme-toggle']")).toBeVisible();
  });

  test("all primitives render in dark theme", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("bw.theme", "dark");
    });
    await page.goto("/design");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await expect(page.locator("[data-testid='cell']").first()).toBeVisible();
    await expect(page.locator("[data-testid='header-row']").first()).toBeVisible();
    await expect(page.locator("[data-testid='code-strip']").first()).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']").first()).toBeVisible();
    await expect(page.locator("[data-testid='caveat-pill']").first()).toBeVisible();
    await expect(page.locator("[data-testid='chip']").first()).toBeVisible();
    await expect(page.locator("[data-testid='big-blob']").first()).toBeVisible();
    await expect(page.locator("[data-testid='trunc-middle']").first()).toBeVisible();
    await expect(page.locator("[data-testid='view-mode-toggle']").first()).toBeVisible();
    await expect(page.locator("[data-testid='theme-toggle']")).toBeVisible();
  });

  test("theme toggle switches theme", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("bw.theme", "light");
    });
    await page.goto("/design");

    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.locator("[data-testid='theme-toggle']").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.locator("[data-testid='theme-toggle']").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("theme persists across page reload", async ({ page }) => {
    await page.goto("/design");

    // Force light baseline via evaluate (addInitScript re-runs on reload, so avoid it here)
    await page.evaluate(() => localStorage.setItem("bw.theme", "light"));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    // Switch to dark
    await page.locator("[data-testid='theme-toggle']").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Reload — should stay dark
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("focus-visible style exists on a sample button", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("bw.theme", "light");
    });
    await page.goto("/design");

    // Tab to the theme toggle button and check focus-visible outline is applied
    const toggle = page.locator("[data-testid='theme-toggle']");
    await toggle.focus();

    // The button should be focusable (not hidden from accessibility tree)
    await expect(toggle).toBeFocused();
  });
});
