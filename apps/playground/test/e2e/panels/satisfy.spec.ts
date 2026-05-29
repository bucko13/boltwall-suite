import { expect, test } from "@playwright/test";

// Macaroon with valid-until=2030-01-01T00:00:00.000Z caveat
// Minted with mintMacaroon({ rootKey: 0x00..1f, identifier: { version:0, paymentHash: 0x01*32, tokenId: 0x20*32 }, caveats: [{condition:"valid-until",value:"2030-01-01T00:00:00.000Z"}] })
const FIXTURE_MACAROON_WITH_CAVEAT =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAIkdmFsaWQtdW50aWw9MjAzMC0wMS0wMVQwMDowMDowMC4wMDBaAAAGIOKb5vesTeSIiXaALw5a1fSW1MGVPtqj1LjPCYQ/3ff/";

test.describe("panels / caveats — check mode", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.click("[data-testid='caveats-mode-check']");
  });

  test("renders panel with header", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toBeVisible();
    await expect(page.locator("[data-testid='header-row']")).toContainText("Caveats");
    await expect(page.locator("[data-testid='header-row']")).toContainText(
      "Add caveats, create time limits, and check satisfiers",
    );
    await expect(page.locator("[data-testid='caveats-mode-check']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: macaroon caveats",
    );
    await expect(page.locator("[data-testid='code-snippet-contract']")).toContainText("exact code");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      "const satisfiers = []",
    );
  });

  test("add valid-until satisfier against token with caveat shows matched result", async ({
    page,
  }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    // valid-until is the default selector; just add it.
    await page.click("[data-testid='satisfy-add-satisfier']");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText(
      "validUntilSatisfier()",
    );
    await page.click("[data-testid='satisfy-run']");

    await expect(page.locator("[data-testid='status-pill']")).toContainText("1/1 matched");
    await expect(page.locator("[data-testid='satisfy-output']")).toBeVisible();
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("valid-until");
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("matched");
  });

  test("checks the shared caveat list without leaving the Caveats panel", async ({ page }) => {
    await page.click("[data-testid='caveats-mode-add']");
    await page.click("[data-testid='caveats-add-kind-time-limit']");
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");

    await expect(page.locator("[data-testid='caveats-mode-add']")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator("[data-testid='caveats-output']")).toContainText("valid-until");

    await page.click("[data-testid='caveats-mode-check']");
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: current caveats",
    );
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");

    await expect(page.locator("[data-testid='status-pill']")).toContainText("1/1 matched");
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("matched");
  });

  test("remove satisfier changes result to unsatisfied", async ({ page }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("1/1 matched");

    // Remove the satisfier
    await page.locator("[data-testid='satisfy-remove-0']").click();
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("0/1 matched");
    await expect(page.locator("[data-testid='satisfy-output']")).toContainText("unsatisfied");
  });

  test("missing token shows error", async ({ page }) => {
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='satisfy-error']")).toBeVisible();
  });

  test("reset clears output", async ({ page }) => {
    await page.fill("[data-testid='satisfy-token-input']", FIXTURE_MACAROON_WITH_CAVEAT);
    await page.click("[data-testid='satisfy-add-satisfier']");
    await page.click("[data-testid='satisfy-run']");
    await expect(page.locator("[data-testid='satisfy-output']")).toBeVisible();
    await page.click("[data-testid='satisfy-reset']");
    await expect(page.locator("[data-testid='satisfy-output']")).not.toBeVisible();
  });
});

test.describe("panels / caveats — Workbench memory", () => {
  test("add mode starts from Workbench macaroon caveats when attenuating", async ({ page }) => {
    await page.addInitScript((macaroon) => {
      window.sessionStorage.setItem(
        "bw.workbench-memory",
        JSON.stringify({
          signingKey: "",
          macaroon,
          challenge: "",
          credential: "",
        }),
      );
    }, FIXTURE_MACAROON_WITH_CAVEAT);

    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await expect(page.locator("[data-testid='caveats-shared-list']")).toContainText(
      "Current caveats from macaroon",
    );
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");

    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");

    await expect(page.locator("[data-testid='caveats-shared-list']")).toContainText(
      "Current caveats",
    );
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("services=pokedex:0");

    await page.click("[data-testid='caveats-mode-check']");
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: current caveats",
    );
    await expect(page.locator("[data-testid='satisfy-token-input']")).toHaveValue("");
  });

  test("lists caveats from a Workbench macaroon as current caveats", async ({ page }) => {
    await page.addInitScript((macaroon) => {
      window.sessionStorage.setItem(
        "bw.workbench-memory",
        JSON.stringify({
          signingKey: "",
          macaroon,
          challenge: "",
          credential: "",
        }),
      );
    }, FIXTURE_MACAROON_WITH_CAVEAT);

    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
    await page.click("[data-testid='caveats-mode-check']");

    await expect(page.locator("[data-testid='satisfy-token-input']")).toHaveValue(
      FIXTURE_MACAROON_WITH_CAVEAT,
    );
    await expect(page.locator("[data-testid='caveats-shared-list']")).toContainText(
      "Current caveats from macaroon",
    );
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");
    await expect(page.locator("[data-testid='caveats-list']")).toContainText(
      "2030-01-01T00:00:00.000Z",
    );
    await expect(page.locator("[data-testid='caveat-remove-0']")).toHaveCount(0);
    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: macaroon caveats (1)",
    );
    await expect(page.locator("[data-testid='code-snippet']")).toContainText("valid-until");
  });

  test("current caveat checks do not show a remembered credential as macaroon input", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.sessionStorage.setItem(
        "bw.workbench-memory",
        JSON.stringify({
          signingKey: "",
          macaroon: "",
          challenge: 'L402 macaroon="abc", invoice="lnbc1demo"',
          credential: `L402 abc:${"00".repeat(32)}`,
        }),
      );
    });

    await page.goto("/p/caveats");
    await page.click("[data-testid='caveats-add-kind-time-limit']");
    await page.fill("[data-testid='expiration-seconds-input']", "3600");
    await page.click("[data-testid='expiration-compute']");
    await page.click("[data-testid='caveats-mode-check']");

    await expect(page.locator("[data-testid='satisfy-source']")).toContainText(
      "Source: current caveats",
    );
    await expect(page.locator("[data-testid='satisfy-token-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='caveats-shared-list']")).toContainText(
      "Current caveats",
    );
  });
});
