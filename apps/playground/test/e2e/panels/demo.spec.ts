import { expect, test } from "@playwright/test";

import { grantClipboard, readClipboard } from "../setup";

const POKEMON_RE = /https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\d+$/;
const PROTECTED_ENDPOINT = "https://boltwall.example.test/pokemon/25";
const PROTECTED_RE = /https:\/\/boltwall\.example\.test\/pokemon\/\d+$/;
const TEST_PREIMAGE = "00".repeat(32);
const DEFAULT_CHALLENGE = 'L402 macaroon="abc", invoice="lnbc1demo"';
const CAVEATED_MACAROON =
  "AgJCAAAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIjMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzAAISc2VydmljZXM9cG9rZWRleDowAAIZcG9rZWRleF9jYXBhYmlsaXRpZXM9cmVhZAACJHZhbGlkLXVudGlsPTIwMzUtMDEtMDFUMDA6MDA6MDAuMDAwWgAABiDi4gvyy2wrfYkMkvxk7vKV2f8qFlyH7KXdAQk40OwxPQ==";

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
    await expect(
      page.locator("[data-testid='demo-endpoint-settings']").locator("summary"),
    ).toContainText("Use a different endpoint");
    await expect(
      page.locator("[data-testid='demo-custom-credential']").locator("summary"),
    ).toContainText("Use an existing L402");
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Get Random Pokemon");
    await expect(page.locator("[data-testid='demo-endpoint-settings-icon']")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await expect(page.locator("[data-testid='demo-custom-credential-icon']")).toHaveAttribute(
      "data-state",
      "closed",
    );
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await expect(page.locator("[data-testid='demo-endpoint-settings-icon']")).toHaveAttribute(
      "data-state",
      "open",
    );
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
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
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toHaveCount(0);
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("unprotected");
    await expect(page.locator("[data-testid='status-pill']")).toHaveAttribute("data-state", "warn");
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText(
      "recipe code",
    );
    const pokemonBox = await page.locator("[data-testid='demo-pokemon']").boundingBox();
    const settingsBox = await page.locator("[data-testid='demo-endpoint-settings']").boundingBox();
    expect(pokemonBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    expect(pokemonBox!.y).toBeLessThan(settingsBox!.y);
  });

  test("surfaces the existing-credential option above the endpoint settings", async ({ page }) => {
    await page.goto("/p/demo");
    const existing = page.locator("[data-testid='demo-custom-credential']");
    const endpointSettings = page.locator("[data-testid='demo-endpoint-settings']");
    await expect(existing).toBeVisible();
    await expect(endpointSettings).toBeVisible();
    await expect(existing.locator("summary")).toContainText("Use an existing L402");

    const existingBox = await existing.boundingBox();
    const endpointBox = await endpointSettings.boundingBox();
    expect(existingBox).not.toBeNull();
    expect(endpointBox).not.toBeNull();
    // "Use an existing L402 credential" sits above "Use a different endpoint".
    expect(existingBox!.y).toBeLessThan(endpointBox!.y);
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

  test("WebLN-mock path: protected endpoint pays and renders Pokemon", async ({
    page,
    context,
  }) => {
    await grantClipboard(context);
    await installWebLnStub(page);
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice']")).toContainText("lnbc");
    await page.click("[data-testid='demo-copy-invoice']");
    await expect.poll(() => readClipboard(page)).toBe("lnbc1demo");
    await expect(page.locator("[data-testid='demo-copy-invoice']")).toHaveText("✓");
    await expect(page.locator("[data-testid='demo-copy-invoice']")).toHaveAttribute(
      "aria-label",
      "Invoice copied",
    );
    await expect(page.getByText("Invoice copied")).toBeVisible();
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "L402 challenge captured",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "saved in Workbench memory",
    );
    await expect(page.locator("[data-testid='demo-open-parse']")).toHaveText(
      "Open challenge in Parse",
    );
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveText("⧉");
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveAttribute(
      "aria-label",
      "Copy challenge",
    );
    await page.getByText("Show WWW-Authenticate").click();
    await expect(page.locator("[data-testid='demo-raw-www-authenticate']")).toHaveText(
      'L402 macaroon="abc", invoice="lnbc1demo"',
    );
    await page.click("[data-testid='demo-copy-challenge']");
    await expect.poll(() => readClipboard(page)).toBe('L402 macaroon="abc", invoice="lnbc1demo"');
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveText("✓");
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveAttribute(
      "aria-label",
      "Challenge copied",
    );
    await expect(page.getByText("Challenge copied")).toBeVisible();
    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText("L402");
    // The macaroon is shared by the challenge and the credential, so it is
    // auto-filled into Workbench memory alongside them.
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "macaroon: abc",
    );
    await expect(page.locator("[data-testid='demo-created-credential']")).toContainText(
      "Credential created",
    );
    await expect(page.locator("[data-testid='demo-created-credential']")).toContainText(
      "saved in Workbench memory",
    );
    await expect(page.locator("[data-testid='demo-open-validate']")).toHaveText(
      "Open credential in Validate",
    );
    await expect(page.locator("[data-testid='demo-open-parse-credential']")).toHaveText(
      "Open macaroon in Parse",
    );
    await page.getByText("Show Authorization").click();
    await expect(page.locator("[data-testid='demo-raw-authorization']")).toHaveText(
      `L402 abc:${TEST_PREIMAGE}`,
    );
    await page.click("[data-testid='demo-copy-credential']");
    await expect.poll(() => readClipboard(page)).toBe(`L402 abc:${TEST_PREIMAGE}`);
    await expect(page.locator("[data-testid='demo-copy-credential']")).toHaveText("✓");
    await expect(page.locator("[data-testid='demo-copy-credential']")).toHaveAttribute(
      "aria-label",
      "Credential copied",
    );
    await expect(page.getByText("Credential copied")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("loaded");
    await expect(page.locator("[data-testid='status-pill']")).toHaveAttribute("data-state", "pass");
    await expect(page.locator("[data-testid='demo-pokemon-image']")).toHaveAttribute(
      "src",
      "https://img.example.test/pikachu.png",
    );
  });

  test("opens captured L402 challenge in Parse through Workbench", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toBeVisible();
    // The macaroon is auto-filled from the challenge as soon as the 402 is captured.
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "macaroon: abc",
    );

    await page.click("[data-testid='demo-open-parse']");

    await expect(page).toHaveURL(/\/p\/parse\?from-challenge\.challenge=/);
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='challenge-input']")).toHaveValue(
      'L402 macaroon="abc", invoice="lnbc1demo"',
    );

    await page.goBack();
    await expect(page).toHaveURL(/\/p\/demo/);
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "L402 challenge captured",
    );
    await expect(page.locator("[data-testid='demo-open-parse']")).toHaveText(
      "Open challenge in Parse",
    );
  });

  test("opens created credential in Validate through Workbench", async ({ page }) => {
    await installWebLnStub(page);
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-created-credential']")).toBeVisible();

    await page.click("[data-testid='demo-open-validate']");

    await expect(page).toHaveURL(/\/p\/validate\?validate\.token=/);
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "macaroon: abc",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-clear-all']")).toHaveCSS(
      "white-space",
      "nowrap",
    );
    // Validate inputs are local state now; the credential is carried in Workbench
    // memory and loaded via the explicit fill button.
    await page.click("[data-testid='validate-fill-credential']");
    await expect(page.locator("[data-testid='validate-token-input']")).toHaveValue(
      `L402 abc:${TEST_PREIMAGE}`,
    );

    await page.reload();
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");

    await page.goBack();
    await expect(page).toHaveURL(/\/p\/demo/);
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='demo-created-credential']")).toContainText(
      "Credential created",
    );
    await expect(page.locator("[data-testid='demo-open-validate']")).toHaveText(
      "Open credential in Validate",
    );
    await expect(page.locator("[data-testid='demo-open-parse-credential']")).toHaveText(
      "Open macaroon in Parse",
    );

    await page.click("[data-testid='workbench-memory-clear-all']");
    await page.reload();
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText(
      "empty",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("empty");
    await expect(page.locator("[data-testid='demo-created-credential']")).toHaveCount(0);
  });

  test("shows captured L402 caveats with an expiration timer", async ({ page }) => {
    await installWebLnStub(page);
    await routeProtectedPokemon(page, `L402 macaroon="${CAVEATED_MACAROON}", invoice="lnbc1demo"`);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-caveats']")).toContainText("Restrictions");
    await expect(page.locator("[data-testid='demo-caveat-0']")).toContainText("services pokedex:0");
    await expect(page.locator("[data-testid='demo-caveat-1']")).toContainText("pokedex can read");
    await expect(page.locator("[data-testid='demo-caveat-2']")).toContainText("expires");
    await expect(page.locator("[data-testid='demo-caveat-timer-0']")).toContainText(/expires in/);

    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-created-credential']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-caveats']")).toContainText("Restrictions");
    await expect(page.locator("[data-testid='demo-caveat-timer-0']")).toContainText(/expires in/);
    await page.click("[data-testid='demo-open-parse-credential']");

    await expect(page).toHaveURL(/\/p\/parse\?.*parse-token\.token=/);
    await expect(page).toHaveURL(/from-challenge\.challenge=/);
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "AgJCAAAi",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='challenge-input']")).toHaveValue(
      `L402 macaroon="${CAVEATED_MACAROON}", invoice="lnbc1demo"`,
    );
    await expect(page.locator("[data-testid='parse-token-input']")).toHaveValue(CAVEATED_MACAROON);

    await page.reload();
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "AgJCAAAi",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");

    await page.goBack();
    await expect(page).toHaveURL(/\/p\/demo/);
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText(
      "AgJCAAAi",
    );
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
  });

  test("reuses a paid credential for later protected requests", async ({ page }) => {
    await installWebLnStub(page);
    let challengeRequests = 0;
    let authorizedRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        authorizedRequests += 1;
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: pokemonPayload(),
        });
        return;
      }
      challengeRequests += 1;
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

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "credential active for this endpoint",
    );

    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
    expect(challengeRequests).toBe(1);
    expect(authorizedRequests).toBe(2);
  });

  test("persists the paid credential across navigation", async ({ page }) => {
    await installWebLnStub(page);
    let challengeRequests = 0;
    let authorizedRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        authorizedRequests += 1;
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: pokemonPayload(),
        });
        return;
      }
      challengeRequests += 1;
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

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "credential active for this endpoint",
    );

    // Navigate to another panel and back; the paid credential + endpoint persist.
    await page.getByTestId("nav-link-parse").click();
    await expect(page).toHaveURL(/\/p\/parse/);
    await page.getByTestId("nav-link-demo").click();
    await expect(page).toHaveURL(/\/p\/demo/);

    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      PROTECTED_ENDPOINT,
    );
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "credential active for this endpoint",
    );

    // Fetching again reuses the persisted credential — no fresh challenge, no re-pay.
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
    expect(challengeRequests).toBe(1);
    expect(authorizedRequests).toBe(2);
  });

  test("clears a rejected cached credential and prompts for a fresh challenge", async ({
    page,
  }) => {
    let authorizedRequests = 0;
    let challengeRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        authorizedRequests += 1;
        if (authorizedRequests === 1) {
          await route.fulfill({
            status: 200,
            headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
            json: pokemonPayload(),
          });
          return;
        }
        await route.fulfill({
          status: 401,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: { error: "credential-rejected" },
        });
        return;
      }
      challengeRequests += 1;
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

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "credential active for this endpoint",
    );

    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-credential-status']")).toHaveCount(0);
    expect(authorizedRequests).toBe(2);
    expect(challengeRequests).toBe(2);
  });

  test("clears cached credentials when the endpoint override changes", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "credential active for this endpoint",
    );

    await page.fill("[data-testid='demo-endpoint-input']", "https://other.example.test/pokemon/25");

    await expect(page.locator("[data-testid='demo-credential-status']")).toHaveCount(0);
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
    await expect(page.locator("[data-testid='workbench-memory-challenge']")).toContainText("L402");
    await expect(page.locator("[data-testid='workbench-memory-credential']")).toContainText("L402");
    await expect(page.locator("[data-testid='demo-pokemon-type']")).toContainText("electric");
  });

  test("fresh page can use a shared full Authorization credential", async ({ page }) => {
    let authorizedRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization === `L402 abc:${TEST_PREIMAGE}`) {
        authorizedRequests += 1;
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
          "www-authenticate": 'L402 macaroon="fresh", invoice="lnbc1demo"',
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill(
      "[data-testid='demo-custom-authorization']",
      `Authorization: L402 abc:${TEST_PREIMAGE}`,
    );
    await page.click("[data-testid='demo-use-custom-authorization']");
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Custom L402 credential active for this endpoint",
    );

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
    expect(authorizedRequests).toBe(1);
  });

  test("can edit and replace the macaroon used for custom requests", async ({ page }) => {
    let acceptedAuthorization = "";
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization === `L402 def:${TEST_PREIMAGE}`) {
        acceptedAuthorization = authorization;
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: pokemonPayload(),
        });
        return;
      }
      await route.fulfill({
        status: 401,
        headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
        json: { error: "wrong-credential" },
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill("[data-testid='demo-custom-macaroon']", "abc");
    await page.fill("[data-testid='demo-custom-preimage']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-use-custom-parts']");
    await page.fill("[data-testid='demo-custom-macaroon']", "def");
    await page.click("[data-testid='demo-use-custom-parts']");

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    expect(acceptedAuthorization).toBe(`L402 def:${TEST_PREIMAGE}`);
  });

  test("can load a parsed macaroon into the custom credential", async ({ page }) => {
    const fixtureHeader = 'L402 macaroon="abc", invoice="lnbc1demo"';
    let authorizedRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      if (request.headers().authorization === `L402 abc:${TEST_PREIMAGE}`) {
        authorizedRequests += 1;
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
          "www-authenticate": fixtureHeader,
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/p/parse");
    await page.fill("[data-testid='challenge-input']", fixtureHeader);
    await page.click("[data-testid='challenge-parse']");
    await expect(page.locator("[data-testid='workbench-memory-macaroon']")).toContainText("abc");

    await page.getByTestId("nav-link-demo").click();
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.click("[data-testid='demo-load-workbench-macaroon']");
    await expect(page.locator("[data-testid='demo-custom-macaroon']")).toHaveValue("abc");
    await page.fill("[data-testid='demo-custom-preimage']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-use-custom-parts']");

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    expect(authorizedRequests).toBe(1);
  });

  test("rejected custom credentials show recovery actions", async ({ page }) => {
    let challengeRequests = 0;
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        await route.fulfill({
          status: 401,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: { error: "custom-rejected" },
        });
        return;
      }
      challengeRequests += 1;
      await route.fulfill({
        status: 402,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "www-authenticate",
          "content-type": "application/json",
          "www-authenticate": 'L402 macaroon="fresh", invoice="lnbc1demo"',
        },
        json: { error: "payment-required" },
      });
    });

    await page.goto("/p/demo");
    await page.locator("[data-testid='demo-endpoint-settings']").locator("summary").click();
    await page.fill("[data-testid='demo-endpoint-input']", PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill("[data-testid='demo-custom-authorization']", `L402 abc:${TEST_PREIMAGE}`);
    await page.click("[data-testid='demo-use-custom-authorization']");
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-error-title']")).toContainText(
      "Custom credential rejected",
    );
    await expect(page.locator("[data-testid='demo-rejected-credential']")).toContainText(
      "Credential rejected",
    );
    await page
      .locator("[data-testid='demo-rejected-credential']")
      .getByText("Show Authorization")
      .click();
    await expect(page.locator("[data-testid='demo-raw-authorization']")).toHaveText(
      `L402 abc:${TEST_PREIMAGE}`,
    );
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Custom L402 credential active for this endpoint",
    );
    await page.click("[data-testid='demo-fetch-fresh-challenge']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toHaveCount(0);
    expect(challengeRequests).toBe(1);
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

  test("L402 payment response without readable challenge explains header exposure", async ({
    page,
  }) => {
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
      "no readable challenge",
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

async function routeProtectedPokemon(
  page: import("@playwright/test").Page,
  challengeHeader = DEFAULT_CHALLENGE,
) {
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
        "www-authenticate": challengeHeader,
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
