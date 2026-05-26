/**
 * Accessibility validation for the L402 workbench.
 *
 * Uses @axe-core/playwright to run axe accessibility checks against all
 * primary routes in both light and dark themes. Fails on WCAG AA critical
 * and serious violations — the subset that corresponds to Lighthouse a11y
 * score >= 90.
 *
 * For the full Lighthouse audit (including performance and best-practices),
 * see lighthouserc.json and the CI "Lighthouse a11y" step which runs
 * @lhci/cli against the production build.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { setTheme } from "./setup";

const PANEL_ROUTES = [
  "/",
  "/p/generate",
  "/p/parse",
  "/p/caveats",
  "/p/validate",
  "/p/demo",
  "/design",
] as const;

// WCAG 2.1 AA rules — impact levels that would drop Lighthouse a11y below 90.
const WCAG_AA_IMPACT = ["critical", "serious"] as const;

for (const route of PANEL_ROUTES) {
  test.describe(`a11y: ${route}`, () => {
    test("light theme — no WCAG AA violations", async ({ page }) => {
      await setTheme(page, "light");
      await page.goto(route);
      // Brief wait for any async renders to settle.
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();

      const critical = results.violations.filter((v) =>
        WCAG_AA_IMPACT.includes(v.impact as (typeof WCAG_AA_IMPACT)[number]),
      );

      expect(critical, formatViolations(route, "light", critical)).toHaveLength(0);
    });

    test("dark theme — no WCAG AA violations", async ({ page }) => {
      await setTheme(page, "dark");
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();

      const critical = results.violations.filter((v) =>
        WCAG_AA_IMPACT.includes(v.impact as (typeof WCAG_AA_IMPACT)[number]),
      );

      expect(critical, formatViolations(route, "dark", critical)).toHaveLength(0);
    });
  });
}

function formatViolations(
  route: string,
  theme: string,
  violations: { id: string; description: string; impact?: string | null; nodes: unknown[] }[],
): string {
  if (violations.length === 0) return "";
  return (
    `\nWCAG AA violations on ${route} (${theme} theme):\n` +
    violations
      .map((v) => `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
      .join("\n")
  );
}
