import { expect, test, type Page } from "@playwright/test";
import { mintMacaroon } from "@boltwall/l402";
import { specPreimageFixtures } from "@boltwall/test-fixtures";

import { grantClipboard, readClipboard } from "../setup";

const POKEMON_RE = /https:\/\/pokeapi\.co\/api\/v2\/pokemon\/\d+$/;
const PROTECTED_ENDPOINT = "https://boltwall.example.test/pokemon/25";
const PROTECTED_RE = /https:\/\/boltwall\.example\.test\/pokemon\/\d+$/;
const TEST_PREIMAGE = "00".repeat(32);
const DEFAULT_CHALLENGE = 'L402 macaroon="abc", invoice="lnbc1demo"';
const CAVEATED_MACAROON =
  "AgJCAAAiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIjMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzAAISc2VydmljZXM9cG9rZWRleDowAAIZcG9rZWRleF9jYXBhYmlsaXRpZXM9cmVhZAACJHZhbGlkLXVudGlsPTIwMzUtMDEtMDFUMDA6MDA6MDAuMDAwWgAABiDi4gvyy2wrfYkMkvxk7vKV2f8qFlyH7KXdAQk40OwxPQ==";
const EXPIRED_CAVEATED_MACAROON = mintMacaroon({
  rootKey: new Uint8Array(32).fill(0x11),
  identifier: {
    version: 0,
    paymentHash: hexToBytes(zeroPreimageFixture().paymentHashHex),
    tokenId: new Uint8Array(32).fill(0x22),
  },
  caveats: [
    "services=pokedex:0",
    "valid-until=2020-01-01T00:00:00.000Z",
    "expiration=1577836800000",
  ],
});
const MIXED_EXPIRATION_CAVEATED_MACAROON = mintMacaroon({
  rootKey: new Uint8Array(32).fill(0x11),
  identifier: {
    version: 0,
    paymentHash: hexToBytes(zeroPreimageFixture().paymentHashHex),
    tokenId: new Uint8Array(32).fill(0x22),
  },
  caveats: [
    "services=pokedex:0",
    "valid-until=2035-01-01T00:00:00.000Z",
    "expiration=1577836800000",
  ],
});
const WORKBENCH_FIELD_BY_TEST_ID = {
  "workbench-memory-key": "signingKey",
  "workbench-memory-macaroon": "macaroon",
  "workbench-memory-challenge": "challenge",
  "workbench-memory-credential": "credential",
} as const;

type WorkbenchMemoryTestId = keyof typeof WORKBENCH_FIELD_BY_TEST_ID;

async function getWorkbenchMemoryValue(page: Page, testId: WorkbenchMemoryTestId) {
  const field = WORKBENCH_FIELD_BY_TEST_ID[testId];
  return page.evaluate((memoryField) => {
    const raw = window.sessionStorage.getItem("bw.workbench-memory");
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return typeof parsed[memoryField] === "string" ? parsed[memoryField] : "";
  }, field);
}

async function expectMemoryEmpty(page: Page, testId: WorkbenchMemoryTestId) {
  await expect(page.locator(`[data-testid='${testId}-status']`)).toHaveText("empty");
  await expect.poll(() => getWorkbenchMemoryValue(page, testId)).toBe("");
}

async function expectMemoryValue(page: Page, testId: WorkbenchMemoryTestId, expected: string) {
  await expect(page.locator(`[data-testid='${testId}-status']`)).toHaveText("stored");
  await expect.poll(() => getWorkbenchMemoryValue(page, testId)).toContain(expected);
}

async function fillEndpoint(page: Page, endpoint: string) {
  await page.fill("[data-testid='demo-endpoint-input']", endpoint);
}

function zeroPreimageFixture() {
  const fixture = specPreimageFixtures.find(
    (candidate) => candidate.name === "zero-preimage-canonical",
  );
  if (fixture === undefined) throw new Error("missing-zero-preimage-fixture");
  return fixture;
}

function hexToBytes(hex: string) {
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

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
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      "https://pokeapi.co/api/v2/pokemon/{id}",
    );
    await expect(page.locator("[data-testid='demo-endpoint-settings']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-active-endpoint']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-endpoint-reset']")).toHaveCount(0);
    await expect(
      page.locator("[data-testid='demo-custom-credential']").locator("summary"),
    ).toContainText("BYOC");
    await expect(page.locator("[data-testid='demo-get-pokemon']")).toHaveText("Get Random Pokemon");
    await expect(page.locator("[data-testid='demo-custom-credential-icon']")).toHaveAttribute(
      "data-state",
      "closed",
    );
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
    const endpointBox = await page.locator("[data-testid='demo-endpoint-input']").boundingBox();
    expect(pokemonBox).not.toBeNull();
    expect(endpointBox).not.toBeNull();
    expect(endpointBox!.y).toBeLessThan(pokemonBox!.y);
  });

  test("surfaces the existing-credential option below the endpoint field", async ({ page }) => {
    await page.goto("/p/demo");
    const existing = page.locator("[data-testid='demo-custom-credential']");
    const endpointInput = page.locator("[data-testid='demo-endpoint-input']");
    await expect(existing).toBeVisible();
    await expect(endpointInput).toBeVisible();
    await expect(existing.locator("summary")).toContainText("BYOC");

    const existingBox = await existing.boundingBox();
    const endpointBox = await endpointInput.boundingBox();
    expect(existingBox).not.toBeNull();
    expect(endpointBox).not.toBeNull();
    expect(endpointBox!.y).toBeLessThan(existingBox!.y);
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
    await fillEndpoint(page, "https://demo.example.test/pokemon/25");
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice']")).toContainText("lnbc");
    await expect(page.locator("[data-testid='demo-invoice-qr']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );
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
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "Add it to Workbench",
    );
    await expectMemoryEmpty(page, "workbench-memory-challenge");
    await expectMemoryEmpty(page, "workbench-memory-macaroon");
    await expect(page.locator("[data-testid='demo-add-challenge-workbench']")).toHaveText(
      "Add to Workbench",
    );
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveText("⧉");
    await expect(page.locator("[data-testid='demo-copy-challenge']")).toHaveAttribute(
      "aria-label",
      "Copy challenge",
    );
    await page.getByText("Show raw header").click();
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
    await page.click("[data-testid='demo-add-challenge-workbench']");
    await expect(page.locator("[data-testid='demo-add-workbench-feedback']")).toContainText(
      "Added to Workbench",
    );
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");
    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expectMemoryEmpty(page, "workbench-memory-credential");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");
    await expect(page.locator("[data-testid='demo-created-credential']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Source: Demo payment",
    );
    await expect(page.locator("[data-testid='demo-add-credential-workbench']")).toHaveText(
      "Add to Workbench",
    );
    await expect(page.locator("[data-testid='demo-open-validate']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-open-parse-credential']")).toHaveCount(0);
    await page.click("[data-testid='demo-add-credential-workbench']");
    await expectMemoryValue(page, "workbench-memory-credential", "L402");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");
    await expect(page.locator("[data-testid='demo-add-credential-workbench']")).toHaveText(
      "Added to Workbench",
    );
    await expect(page.locator("[data-testid='demo-add-credential-workbench']")).toBeDisabled();
    await page.getByText("Show raw header").click();
    await expect(page.locator("[data-testid='demo-raw-authorization']")).toHaveText(
      `L402 abc:${TEST_PREIMAGE}`,
    );
    await page.click("[data-testid='demo-copy-credential']");
    await expect.poll(() => readClipboard(page)).toBe(`L402 abc:${TEST_PREIMAGE}`);
    await expect(page.locator("[data-testid='demo-copy-credential']")).toHaveText("✓");
    await expect(page.locator("[data-testid='demo-copy-credential']")).toHaveAttribute(
      "aria-label",
      "Authorization header copied",
    );
    await expect(page.getByText("Authorization header copied")).toBeVisible();
    await expect(page.locator("[data-testid='status-pill']")).toHaveText("loaded");
    await expect(page.locator("[data-testid='status-pill']")).toHaveAttribute("data-state", "pass");
    await expect(page.locator("[data-testid='demo-pokemon-image']")).toHaveAttribute(
      "src",
      "https://img.example.test/pikachu.png",
    );
  });

  test("WebLN rejection preserves the captured challenge and invoice QR fallback", async ({
    page,
  }) => {
    await installRejectingWebLnStub(page, "Prompt was closed");
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();

    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-payment-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice']")).toContainText("lnbc1demo");
    await expect(page.locator("[data-testid='demo-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "L402 challenge captured",
    );

    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
  });

  test("WebLN pending payment keeps the invoice visible", async ({ page }) => {
    await page.addInitScript(() => {
      const webln = {
        async enable() {},
        async sendPayment(_invoice: string) {
          await new Promise(() => {});
          return { preimage: "" };
        },
      };
      Object.defineProperty(window, "webln", {
        value: webln,
        configurable: true,
        writable: true,
      });
    });
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();

    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-invoice']")).toContainText("lnbc1demo");
    await expect(page.locator("[data-testid='demo-invoice-qr']")).toHaveAttribute(
      "data-invoice",
      "lnbc1demo",
    );
    await expect(page.locator("[data-testid='demo-pay-webln']")).toBeDisabled();
  });

  test("adds captured L402 challenge to Workbench explicitly", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toBeVisible();
    await expectMemoryEmpty(page, "workbench-memory-macaroon");
    await expectMemoryEmpty(page, "workbench-memory-challenge");
    await expect(page.locator("[data-testid='demo-open-parse']")).toHaveCount(0);

    await page.click("[data-testid='demo-add-challenge-workbench']");

    await expect(page).toHaveURL(/\/p\/demo$/);
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");
    await expectMemoryEmpty(page, "workbench-memory-credential");
    await expect(page.locator("[data-testid='demo-captured-challenge']")).toContainText(
      "L402 challenge captured",
    );
    await expect(page.locator("[data-testid='demo-add-workbench-feedback']")).toContainText(
      "Added to Workbench",
    );
  });

  test("adds created credential to Workbench explicitly", async ({ page }) => {
    await installWebLnStub(page);
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "bw.workbench-memory",
        JSON.stringify({
          signingKey: "0001020304050607080900010203040506070809000102030405060708090001",
          macaroon: "stale-macaroon",
          challenge: "stale-challenge",
          credential: "stale-credential",
        }),
      );
    });
    await page.reload();
    await expectMemoryValue(page, "workbench-memory-key", "00010203");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-created-credential']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );
    await expectMemoryValue(page, "workbench-memory-credential", "stale");
    await expectMemoryValue(page, "workbench-memory-challenge", "stale");
    await expect(page.locator("[data-testid='demo-open-validate']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-open-parse-credential']")).toHaveCount(0);

    await page.click("[data-testid='demo-add-credential-workbench']");

    await expect(page).toHaveURL(/\/p\/demo$/);
    await expectMemoryEmpty(page, "workbench-memory-key");
    await expectMemoryValue(page, "workbench-memory-credential", "L402");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expect(page.locator("[data-testid='workbench-memory-clear-all']")).toHaveCSS(
      "white-space",
      "nowrap",
    );

    await page.reload();
    await expectMemoryValue(page, "workbench-memory-credential", "L402");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");

    await expect(page).toHaveURL(/\/p\/demo/);
    await expectMemoryValue(page, "workbench-memory-credential", "L402");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );

    await page.click("[data-testid='workbench-memory-clear-all']");
    await page.reload();
    await expectMemoryEmpty(page, "workbench-memory-credential");
    await expectMemoryEmpty(page, "workbench-memory-challenge");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );
  });

  test("shows captured L402 caveats with an expiration timer", async ({ page }) => {
    await installWebLnStub(page);
    await routeProtectedPokemon(page, `L402 macaroon="${CAVEATED_MACAROON}", invoice="lnbc1demo"`);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-caveats']")).toContainText("Restrictions");
    await expect(page.locator("[data-testid='demo-caveat-0']")).toContainText("services pokedex:0");
    await expect(page.locator("[data-testid='demo-caveat-1']")).toContainText("pokedex can read");
    await expect(page.locator("[data-testid='demo-caveat-2']")).toContainText("expires");
    await expect(page.locator("[data-testid='demo-caveat-timer-0']")).toContainText(/expires in/);

    await page.click("[data-testid='demo-pay-webln']");

    await expect(page.locator("[data-testid='demo-created-credential']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );
    await expect(page.locator("[data-testid='demo-active-credential-caveats']")).toContainText(
      "Restrictions",
    );
    await expect(
      page.locator("[data-testid='demo-active-credential-caveat-timer-0']"),
    ).toContainText(/expires in/);
    await expectMemoryEmpty(page, "workbench-memory-macaroon");
    await expectMemoryEmpty(page, "workbench-memory-challenge");
    await page.click("[data-testid='demo-add-credential-workbench']");

    await expect(page).toHaveURL(/\/p\/demo$/);
    await expectMemoryValue(page, "workbench-memory-macaroon", "AgJCAAAi");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");

    await page.reload();
    await expectMemoryValue(page, "workbench-memory-macaroon", "AgJCAAAi");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");

    await expect(page).toHaveURL(/\/p\/demo/);
    await expectMemoryValue(page, "workbench-memory-macaroon", "AgJCAAAi");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
  });

  test("does not repeat bare expired lines for multiple expired caveats", async ({ page }) => {
    await routeProtectedPokemon(
      page,
      `L402 macaroon="${EXPIRED_CAVEATED_MACAROON}", invoice="lnbc1demo"`,
    );

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-caveat-1']")).toContainText("expires");
    await expect(page.locator("[data-testid='demo-caveat-2']")).toContainText("expires");
    await expect(page.locator("[data-testid='demo-caveat-expired-summary']")).toHaveCount(0);
    await expect(page.locator("[data-testid^='demo-caveat-timer-']")).toHaveCount(0);
  });

  test("does not show an active countdown when another time caveat is expired", async ({
    page,
  }) => {
    await routeProtectedPokemon(
      page,
      `L402 macaroon="${MIXED_EXPIRATION_CAVEATED_MACAROON}", invoice="lnbc1demo"`,
    );

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-caveat-1']")).toContainText("expires");
    await expect(page.locator("[data-testid='demo-caveat-2']")).toContainText("expires");
    await expect(page.locator("[data-testid^='demo-caveat-timer-']")).toHaveCount(0);
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.click("[data-testid='demo-pay-webln']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );

    // Navigate to another panel and back; the paid credential + endpoint persist.
    await page.getByTestId("nav-link-parse").click();
    await expect(page).toHaveURL(/\/p\/parse/);
    await page.getByTestId("nav-link-demo").click();
    await expect(page).toHaveURL(/\/p\/demo/);

    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      PROTECTED_ENDPOINT,
    );
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");
    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");
    await expect(page.locator("[data-testid='demo-credential-status']")).toContainText(
      "Credential ready",
    );

    await fillEndpoint(page, "https://other.example.test/pokemon/25");

    await expect(page.locator("[data-testid='demo-credential-status']")).toHaveCount(0);
  });

  test("manual paste path retries a protected endpoint", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    await page.fill("[data-testid='demo-preimage-input']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-preimage-submit']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expectMemoryEmpty(page, "workbench-memory-challenge");
    await expectMemoryEmpty(page, "workbench-memory-credential");
    await page.click("[data-testid='demo-add-credential-workbench']");
    await expectMemoryValue(page, "workbench-memory-challenge", "L402");
    await expectMemoryValue(page, "workbench-memory-credential", "L402");
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill(
      "[data-testid='demo-custom-authorization']",
      `Authorization: L402 abc:${TEST_PREIMAGE}`,
    );
    await page.click("[data-testid='demo-use-custom-authorization']");
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Credential ready",
    );

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
    expect(authorizedRequests).toBe(1);
  });

  test("can fill BYOC from a Workbench credential and use it", async ({ page }) => {
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
    await page.evaluate((credential) => {
      window.sessionStorage.setItem(
        "bw.workbench-memory",
        JSON.stringify({ signingKey: "", macaroon: "", challenge: "", credential }),
      );
    }, `L402 abc:${TEST_PREIMAGE}`);
    await fillEndpoint(page, PROTECTED_ENDPOINT);

    await expect(page.locator("[data-testid='demo-custom-credential']")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(page.locator("[data-testid='demo-use-workbench-credential']")).toHaveText(
      "Fill from Workbench",
    );
    await page.click("[data-testid='demo-use-workbench-credential']");
    await expect(page.locator("[data-testid='demo-custom-credential']")).toHaveAttribute(
      "open",
      "",
    );
    await expect(page.locator("[data-testid='demo-custom-authorization']")).toHaveValue(
      `L402 abc:${TEST_PREIMAGE}`,
    );
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toHaveCount(0);
    await page.click("[data-testid='demo-use-custom-authorization']");
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Credential ready",
    );
    await expect(page.locator("[data-testid='demo-custom-authorization']")).toHaveValue("");

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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
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

    // Seed the Workbench macaroon through Demo's explicit challenge handoff,
    // independent of any other panel.
    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expectMemoryEmpty(page, "workbench-memory-macaroon");
    await page.click("[data-testid='demo-add-challenge-workbench']");
    await expectMemoryValue(page, "workbench-memory-macaroon", "abc");

    await page.click("[data-testid='demo-use-workbench-credential']");
    await expect(page.locator("[data-testid='demo-custom-macaroon']")).toHaveValue("abc");
    await page.fill("[data-testid='demo-custom-preimage']", TEST_PREIMAGE);
    await page.click("[data-testid='demo-use-custom-parts']");
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Credential ready",
    );
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Fetch Endpoint will send this L402 Authorization header",
    );
    await expect(page.locator("[data-testid='demo-clear-custom-credential']")).toHaveText(
      "Clear credential",
    );
    await expect(page.locator("[data-testid='demo-start-fresh']")).toHaveCount(0);

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    expect(authorizedRequests).toBe(1);
  });

  test("clear credential removes a BYOC credential without resetting the flow", async ({
    page,
  }) => {
    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill("[data-testid='demo-custom-authorization']", `L402 abc:${TEST_PREIMAGE}`);
    await page.click("[data-testid='demo-use-custom-authorization']");

    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toContainText(
      "Credential ready",
    );
    await page.click("[data-testid='demo-clear-custom-credential']");

    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-custom-authorization']")).toHaveValue("");
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      PROTECTED_ENDPOINT,
    );
    await expect(page.locator("[data-testid='demo-error']")).toHaveCount(0);
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
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
      .getByText("Show raw header")
      .click();
    await expect(page.locator("[data-testid='demo-raw-authorization']")).toHaveText(
      `L402 abc:${TEST_PREIMAGE}`,
    );
    // The rejected custom credential is dropped immediately, so it no longer
    // shows an active-credential banner and a repeated fetch cannot re-send it.
    await expect(page.locator("[data-testid='demo-custom-credential-status']")).toHaveCount(0);

    // Recovery actions distinguish replacing the pasted credential from
    // resetting the whole flow.
    await expect(page.locator("[data-testid='demo-error-use-another-credential']")).toBeVisible();
    await page.click("[data-testid='demo-error-use-another-credential']");
    await expect(page.locator("[data-testid='demo-custom-credential']")).toHaveAttribute(
      "open",
      "",
    );
    await expect(page.locator("[data-testid='demo-custom-authorization']")).toBeFocused();

    await page.click("[data-testid='demo-error-start-fresh']");
    await expect(page.locator("[data-testid='demo-error-title']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-rejected-credential']")).toHaveCount(0);

    // After Start fresh, a normal fetch recovers with a new challenge.
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
    expect(challengeRequests).toBe(1);
  });

  test("replacing a rejected custom credential clears stale rejection details", async ({
    page,
  }) => {
    const seenAuthorizations: string[] = [];
    await page.route(PROTECTED_RE, async (route, request) => {
      const authorization = request.headers().authorization;
      if (authorization !== undefined) {
        seenAuthorizations.push(authorization);
      }
      if (authorization === `L402 def:${TEST_PREIMAGE}`) {
        await route.fulfill({
          status: 200,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: pokemonPayload(),
        });
        return;
      }
      if (authorization?.startsWith("L402 ") || authorization?.startsWith("LSAT ")) {
        await route.fulfill({
          status: 401,
          headers: { "access-control-allow-origin": "*", "content-type": "application/json" },
          json: { error: "custom-rejected" },
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.locator("[data-testid='demo-custom-credential']").locator("summary").click();
    await page.fill("[data-testid='demo-custom-authorization']", `L402 abc:${TEST_PREIMAGE}`);
    await page.click("[data-testid='demo-use-custom-authorization']");
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-error-title']")).toContainText(
      "Custom credential rejected",
    );
    await expect(page.locator("[data-testid='demo-rejected-credential']")).toContainText(
      `L402 abc:${TEST_PREIMAGE}`,
    );

    await page.fill("[data-testid='demo-custom-authorization']", `L402 def:${TEST_PREIMAGE}`);
    await page.click("[data-testid='demo-use-custom-authorization']");
    await expect(page.locator("[data-testid='demo-rejected-credential']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-error-title']")).toHaveCount(0);

    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-pokemon-name']")).toContainText("pikachu");
    await expect(page.locator("[data-testid='demo-rejected-credential']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-error-title']")).toHaveCount(0);
    expect(seenAuthorizations).toEqual([`L402 abc:${TEST_PREIMAGE}`, `L402 def:${TEST_PREIMAGE}`]);
  });

  test("request failures show endpoint and origin diagnostics", async ({ page }) => {
    await page.route(PROTECTED_RE, async (route) => {
      await route.abort("failed");
    });

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
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
    await expect(page.locator("[data-testid='demo-error-start-fresh']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);

    await page.click("[data-testid='demo-endpoint-reset']");
    await expect(page.locator("[data-testid='demo-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-endpoint-input']")).toHaveValue(
      "https://pokeapi.co/api/v2/pokemon/{id}",
    );
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");

    await expect(page.locator("[data-testid='demo-error-title']")).toContainText(
      "no readable challenge",
    );
    await expect(page.locator("[data-testid='demo-error-details']")).toContainText(
      "WWW-Authenticate",
    );
    await expect(page.locator("[data-testid='demo-error-start-fresh']")).toBeVisible();
    await expect(page.locator("[data-testid='demo-payment']")).toHaveCount(0);
  });

  test("malformed pasted preimage surfaces an error and does not retry", async ({ page }) => {
    await routeProtectedPokemon(page);

    await page.goto("/p/demo");
    await fillEndpoint(page, PROTECTED_ENDPOINT);
    await page.click("[data-testid='demo-get-pokemon']");
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();

    await page.fill("[data-testid='demo-preimage-input']", "not-hex-and-too-short");
    await page.click("[data-testid='demo-preimage-submit']");

    await expect(page.locator("[data-testid='demo-error']")).toHaveCount(0);
    await expect(page.locator("[data-testid='demo-payment-error']")).toContainText(
      "invalid-preimage",
    );
    await expect(page.locator("[data-testid='demo-payment']")).toBeVisible();
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
    await fillEndpoint(page, PROTECTED_ENDPOINT);
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

async function installRejectingWebLnStub(page: import("@playwright/test").Page, message: string) {
  await page.addInitScript((errorMessage) => {
    const webln = {
      async enable() {},
      async sendPayment(_invoice: string) {
        throw new Error(errorMessage);
      },
    };
    Object.defineProperty(window, "webln", {
      value: webln,
      configurable: true,
      writable: true,
    });
  }, message);
}
