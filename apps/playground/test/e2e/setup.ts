/**
 * Shared e2e test helpers for the L402 workbench.
 */
import type { BrowserContext, Page } from "@playwright/test";

/** Set the playground theme via localStorage before navigation. */
export function setTheme(page: Page, theme: "light" | "dark") {
  return page.addInitScript((t: string) => {
    localStorage.setItem("bw.theme", t);
  }, theme);
}

/** Grant clipboard read/write permissions to the browser context. */
export async function grantClipboard(context: BrowserContext) {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
}

/** Read clipboard text after a copy action. */
export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Build a panel URL with URL-state search params.
 * e.g. panelUrl("validate", { token: "abc", key: "def" })
 */
export function panelUrl(panel: string, params: Record<string, string> = {}): string {
  const q = new URLSearchParams(params);
  const qs = q.toString();
  return `/p/${panel}${qs ? `?${qs}` : ""}`;
}

/** Decode hex string to Uint8Array (Node-side utility for test setup). */
export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
