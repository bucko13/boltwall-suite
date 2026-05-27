import { expect, test } from "@playwright/test";

const POKEMON_RE = /https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\d+$/;
const PROTECTED_ENDPOINT = "https://boltwall.example.test/pokemon/25";
const PROTECTED_RE = /https:\/\/boltwall\.example\.test\/pokemon\/\d+$/;
const TEST_PREIMAGE = "00".repeat(32);

test.describe("panels / demo", () => {
  test("fetches a random public Pokedex endpoint and renders the sprite", async ({ page }) => {
    await page.route(POKEMON_RE, async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        json: pokemonPayload(),
      });
    });

    await page.goto("/p/demo");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-endpoint-input']")).not.toBeVisible();
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-pokemon-type']")).toContainText("electric");
    await expect(page.locator("[data-testid='demo-pokemon-image']")).toHaveAttribute(
      "src",
      "https://img.example.test/pikachu.png",
    );
    await expect(page.locator("[data-testid='demo-l402-empty']")).toContainText(
      "no L402 challenge returned",
    );
    await expect(page.locator("[data-testid='demo-l402-details']")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("unprotected");
    await expect(page.locator("[data-testid='status-pill']")).toHaveAttribute("data-state", "warn");
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText(
      "recipe code",
    );
  });

  test("can use an advanced explicit unprotected endpoint", async ({ page }) => {
    await page.route(/https:\/\/demo\.example\.test\/pokemon\/\d+$/, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
        json: pokemonPayload({ id: 25, name: "pikachu" }),
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", "https://demo.example.test/pokemon/25");
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-pokemon-image']")).toBeVisible();
  });

  test("WebLN-mock path: protected endpoint pays and renders Pokemon", async ({ page }) => {
    await installWebLnStub(page);
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice']")).toContainText("lnbc");
    await page.locator("[data-testid='demo-l402-details']").locator("summary").click();
    await expect(page.locator("[data-testid='demo-l402-challenge']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-scheme']")).toHaveText("L402");
    await expect(page.locator("[data-testid='demo-protocol-invoice']")).toContainText("lnbc");
    await expect(page.locator("[data-testid='demo-protocol-macaroon']")).toHaveText("abc");
    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("loaded");
    await expect(page.locator("[data-testid='status-pill']")).toHaveAttribute("data-state", "pass");
    await expect(page.locator("[data-testid='demo-pokemon-image']")).toHaveAttribute(
      "src",
      "https://img.example.test/pikachu.png",
    );
  });

  test("manual paste path retries a protected endpoint", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-pokemon-type']")).toContainText("electric");
  });

  test("request failures show endpoint and origin diagnostics", async ({ page }) => {
    await page.route(PROTECTED_RE, async (route) => {
      await route.abort("failed");
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-error-title']")).toContainText(
      "could not read a response",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "Endpoint: https://boltwall.example.test/pokemon/",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "Playground origin:",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "CORS policy allows this playground origin",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "WWW-Authenticate",
    );
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
  });

  test("402 without readable challenge explains header exposure", async ({ page }) => {
    await page.route(PROTECTED_RE, async (route) => {
      await route.fulfill({
        status: 402,
        headers: {
          "access-control-allow-origin": "*",
          "content-type": "application/json",
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-error-title']")).toContainText(
      "no readable L402 challenge",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "WWW-Authenticate",
    );
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
  });

  test("malformed pasted preimage surfaces an error and does not retry", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();

    await page.fill("[data-testid='demo-preimage-input']", "not-hex-and-too-short");
    await page.click("[data-testid='demo-preimage-submit']");

    await expect(page.locator("[data-testid='demo-error']")).toContainText("invalid-preimage");
    await expect(page.locator("[data-testid='demo-pokemon']")).toHaveCount(0);
  });

  test("WebLN unavailable leaves manual fallback operable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "webln", {
        value: undefined,
        configurable: true,
        writable: true,
      });
    });
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pay-webln']")).toBeDisabled();
    await expect(page.locator("[data-testid='demo-pay-webln']")).toContainText("WebLN unavailable");
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
  });
});

function pokemonPayload(overrides: Partial<{ id: number; name: string }> = {}) {
  return {
    id: overrides.id ?? 25,
    name: overrides.name ?? "pikachu",
    sprites: { front_default: "https://img.example.test/pikachu.png" },
    types: [{ type: { name: "electric" } }],
    species: { name: "bulbasaur" },
  };
}

async function routeProtectedPokemon(page: import("@playwright/test").Page) {
  await page.route(PROTECTED_RE, async (route, request) => {
    const authorization = request.headers().authorization;
    if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
      await route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
        json: pokemonPayload(),
      });
      return;
    }
    await route.fulfill({
      status: 402,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "www-authenticate",
        "content-type": "application/json",
        "www-authenticate": 'L402 macaroon="abc", invoice="lnbc1demo"',
      },
      json: { error: "payment-required" },
    });
  });
}

async function installWebLnStub(page: import("@playwright/test").Page) {
  await page.addInitScript((preimage) => {
    const webln = {
      async enable() {},
      async sendPayment(_invoice: string) {
        return { preimage };
      },
    };
    Object.defineProperty(window, "webln", {
      value: webln,
      configurable: true,
      writable: true,
    });
  }, TEST_PREIMAGE);
}
