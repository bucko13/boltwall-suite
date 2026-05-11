import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "test/browser",
  reporter: "list",
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
