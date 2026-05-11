import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:31333",
  },
  webServer: {
    command: "bun run scripts/serve-bundle.ts",
    port: 31333,
    timeout: 30_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium-import",
      use: { browserName: "chromium" },
    },
  ],
});
