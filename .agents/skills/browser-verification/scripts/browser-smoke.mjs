#!/usr/bin/env node

import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    const bunStore = join(process.cwd(), "node_modules", ".bun");
    if (existsSync(bunStore)) {
      for (const entry of readdirSync(bunStore)) {
        const candidate = join(bunStore, entry, "node_modules", "playwright");
        if (entry.startsWith("playwright@") && existsSync(candidate)) {
          return createRequire(join(candidate, "package.json"))("playwright");
        }
      }
    }
    throw new Error("Unable to resolve Playwright. Run bun install from the task worktree first.");
  }
}

const { chromium } = loadPlaywright();

const url =
  process.argv[2] ??
  process.env.BROWSER_SMOKE_URL ??
  process.env.PLAYWRIGHT_BASE_URL ??
  "http://127.0.0.1:3000";
const selector = process.env.BROWSER_SMOKE_SELECTOR ?? "main";

const ignoredConsole = [
  /Download the React DevTools/i,
  /NO_COLOR.*FORCE_COLOR/i,
  /allowedDevOrigins/i,
];

const viewports = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
];

function isIgnored(message) {
  return ignoredConsole.some((pattern) => pattern.test(message));
}

const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    const consoleLines = [];
    const pageErrors = [];
    const requestFailures = [];

    page.on("console", (message) => {
      const line = `${message.type()}: ${message.text()}`;
      if (!isIgnored(line)) {
        consoleLines.push(line);
      }
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      if (failure && request.resourceType() !== "image") {
        requestFailures.push(`${request.url()} ${failure.errorText}`);
      }
    });

    await page.goto(url, { waitUntil: "networkidle" });

    const title = await page.title();
    const selectorCount = await page.locator(selector).count();
    const blockingConsole = consoleLines.filter((line) => line.startsWith("error:"));

    console.log(`${viewport.name}: title=${JSON.stringify(title)} ${selector}=${selectorCount}`);

    if (selectorCount < 1) {
      failures.push(`${viewport.name}: selector ${selector} not found`);
    }
    failures.push(...pageErrors.map((error) => `${viewport.name}: pageerror: ${error}`));
    failures.push(...blockingConsole.map((line) => `${viewport.name}: ${line}`));
    failures.push(...requestFailures.map((line) => `${viewport.name}: requestfailed: ${line}`));

    if (consoleLines.length === 0) {
      console.log(`${viewport.name}: no blocking console messages`);
    } else {
      console.log(consoleLines.join("\n"));
    }

    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
