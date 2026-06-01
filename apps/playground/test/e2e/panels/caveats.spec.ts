import { expect, test, type Page } from "@playwright/test";

// A valid macaroon (shared with the validate specs) used as a paste fixture.
const FIXTURE_MACAROON =
  "AgJCAAABAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBASAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgAAAGIG7u7yeNG/kpBwGaHpeJZF6Dn9Q1zoLhmSx0PQPPESkC";
const FIXTURE_KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const PREIMAGE = "0000000000000000000000000000000000000000000000000000000000000000";
const FIXTURE_CHALLENGE = `L402 macaroon="${FIXTURE_MACAROON}", invoice="lnbc1demo"`;
const FIXTURE_CREDENTIAL = `L402 ${FIXTURE_MACAROON}:${PREIMAGE}`;

async function macaroonOutput(page: Page): Promise<string> {
  // Wait for the attenuated macaroon to actually render before reading it.
  // Reading textContent unconditionally can return "" if the output has not
  // painted yet (e.g. dev-server cold compile under parallel load), which then
  // feeds an impossible value into downstream Workbench assertions and flakes.
  const output = page.locator("[data-testid='caveats-output'] pre").first();
  await expect(output).toBeVisible();
  await expect(output).not.toHaveText("");
  return (await output.textContent()) ?? "";
}

async function setWorkbenchMemory(
  page: Page,
  memory: Partial<Record<"signingKey" | "macaroon" | "challenge" | "credential", string>>,
) {
  await page.evaluate((next) => {
    window.sessionStorage.setItem(
      "bw.workbench-memory",
      JSON.stringify({
        signingKey: "",
        macaroon: "",
        challenge: "",
        credential: "",
        ...next,
      }),
    );
  }, memory);
  await page.reload();
  await expect(page.locator("[data-testid='cell']")).toBeVisible();
}

async function workbenchMemory(page: Page) {
  return page.evaluate(() => {
    const raw = window.sessionStorage.getItem("bw.workbench-memory");
    return raw
      ? (JSON.parse(raw) as {
          signingKey?: string;
          macaroon?: string;
          challenge?: string;
          credential?: string;
        })
      : {};
  });
}

test.describe("panels / caveats", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/p/caveats");
    await expect(page.locator("[data-testid='cell']")).toBeVisible();
  });

  test("renders header, empty hint, and no satisfier/mode UI", async ({ page }) => {
    await expect(page.locator("[data-testid='header-row']")).toContainText("Caveats");
    await expect(page.locator("[data-testid='header-row']")).toContainText("stage artifacts");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("idle");
    await expect(page.locator("[data-testid='caveats-input']")).toHaveAttribute(
      "placeholder",
      "Paste a macaroon, challenge, or credential",
    );
    await expect(page.locator("[data-testid='caveats-empty-hint']")).toBeVisible();
    // The satisfier framework and the add/check mode tabs are gone.
    await expect(page.locator("[data-testid='caveats-mode-add']")).toHaveCount(0);
    await expect(page.locator("[data-testid='satisfy-run']")).toHaveCount(0);
  });

  test("Workbench fill controls use concise labels with accessible state", async ({ page }) => {
    const actions = page.getByTestId("caveats-workbench-actions");
    await expect(actions).toContainText("Use from Workbench");
    await expect(actions).not.toContainText("Fill macaroon from workbench");
    await expect(page.getByTestId("caveats-fill-macaroon")).toHaveText("Macaroon");
    await expect(page.getByTestId("caveats-fill-challenge")).toHaveText("Challenge");
    await expect(page.getByTestId("caveats-fill-credential")).toHaveText("Credential");
    await expect(page.getByTestId("caveats-fill-macaroon")).toHaveAttribute(
      "aria-label",
      "No macaroon in Workbench",
    );
  });

  test("loads a pasted macaroon and surfaces it as copyable output", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    await expect(page.locator("[data-testid='caveats-output']")).toBeVisible();
    await expect(await macaroonOutput(page)).toBe(FIXTURE_MACAROON);
    await expect(page.locator("[data-testid='status-pill']")).not.toContainText("idle");
  });

  test("accepts a credential and extracts its macaroon", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", `L402 ${FIXTURE_MACAROON}:${PREIMAGE}`);
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    await expect(await macaroonOutput(page)).toBe(FIXTURE_MACAROON);
  });

  test("attenuates with a custom caveat and re-serializes a new macaroon", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    const before = await macaroonOutput(page);

    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");

    await expect(page.locator("[data-testid='caveats-list']")).toContainText("services=pokedex:0");
    await expect(page.locator("[data-testid='caveat-remove-0']")).toBeVisible();
    await expect(page.locator("[data-testid='caveat-origin-0']")).toHaveAttribute(
      "data-state",
      "new",
    );

    const after = await macaroonOutput(page);
    // Appending a caveat re-serializes a longer, different macaroon.
    expect(after).not.toBe(before);
    expect(after.length).toBeGreaterThan(before.length);

    await expect(page.locator("[data-testid='code-snippet']")).toContainText("addFirstPartyCaveat");
    await expect(page.locator("[data-testid='code-snippet']")).toContainText("services");
  });

  test("adds an attenuated bare macaroon to Workbench and clears derived fields", async ({
    page,
  }) => {
    await setWorkbenchMemory(page, {
      signingKey: FIXTURE_KEY,
      challenge: 'L402 macaroon="stale", invoice="lnbc1stale"',
      credential: "L402 stale:0000000000000000000000000000000000000000000000000000000000000000",
    });
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.click("[data-testid='caveats-add-workbench']");
    await expect(page.locator("[data-testid='caveats-workbench-feedback']")).toContainText(
      "Updated macaroon; cleared challenge and credential.",
    );
    await expect
      .poll(() => workbenchMemory(page))
      .toMatchObject({
        signingKey: FIXTURE_KEY,
        macaroon: attenuated,
        challenge: "",
        credential: "",
      });
  });

  test("adds an attenuated challenge to Workbench and clears stale credential", async ({
    page,
  }) => {
    await setWorkbenchMemory(page, {
      signingKey: FIXTURE_KEY,
      credential: FIXTURE_CREDENTIAL,
    });
    await page.fill("[data-testid='caveats-input']", FIXTURE_CHALLENGE);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.click("[data-testid='caveats-add-workbench']");
    await expect(page.locator("[data-testid='caveats-workbench-feedback']")).toContainText(
      "Updated macaroon and challenge; cleared credential.",
    );
    await expect
      .poll(() => workbenchMemory(page))
      .toMatchObject({
        signingKey: FIXTURE_KEY,
        macaroon: attenuated,
        challenge: `L402 macaroon="${attenuated}", invoice="lnbc1demo"`,
        credential: "",
      });
  });

  test("adds an attenuated credential and matching source challenge to Workbench", async ({
    page,
  }) => {
    await setWorkbenchMemory(page, {
      signingKey: FIXTURE_KEY,
      challenge: FIXTURE_CHALLENGE,
      credential: FIXTURE_CREDENTIAL,
    });
    await page.click("[data-testid='caveats-fill-credential']");
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.click("[data-testid='caveats-add-workbench']");
    await expect(page.locator("[data-testid='caveats-workbench-feedback']")).toContainText(
      "Updated macaroon, credential, and challenge.",
    );
    await expect
      .poll(() => workbenchMemory(page))
      .toMatchObject({
        signingKey: FIXTURE_KEY,
        macaroon: attenuated,
        challenge: `L402 macaroon="${attenuated}", invoice="lnbc1demo"`,
        credential: `L402 ${attenuated}:${PREIMAGE}`,
      });
  });

  test("adds an attenuated credential to Workbench and clears unrelated challenge", async ({
    page,
  }) => {
    await setWorkbenchMemory(page, {
      signingKey: FIXTURE_KEY,
      challenge: 'L402 macaroon="stale", invoice="lnbc1stale"',
    });
    await page.fill("[data-testid='caveats-input']", FIXTURE_CREDENTIAL);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.click("[data-testid='caveats-add-workbench']");
    await expect(page.locator("[data-testid='caveats-workbench-feedback']")).toContainText(
      "Updated macaroon and credential; cleared challenge.",
    );
    await expect
      .poll(() => workbenchMemory(page))
      .toMatchObject({
        signingKey: FIXTURE_KEY,
        macaroon: attenuated,
        challenge: "",
        credential: `L402 ${attenuated}:${PREIMAGE}`,
      });
  });

  test("a re-pasted attenuated macaroon shows the caveat as existing (not removable)", async ({
    page,
  }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.fill("[data-testid='caveats-input']", attenuated);
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("services=pokedex:0");
    // It is baked into the macaroon now, so it is "existing" with no remove button.
    await expect(page.locator("[data-testid='caveat-origin-0']")).toHaveAttribute(
      "data-state",
      "existing",
    );
    await expect(page.locator("[data-testid='caveat-remove-0']")).toHaveCount(0);
  });

  test("adds a time-limit caveat that shows an expiry", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-seconds-input']", "3600");
    await page.click("[data-testid='caveat-add-time-limit']");

    await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");
    await expect(page.locator("[data-testid='caveat-state-0']")).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.locator("[data-testid='caveat-origin-0']")).toHaveAttribute(
      "data-state",
      "new",
    );
  });

  test("renders expired existing caveats as distinct badges", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "valid-until");
    await page.fill("[data-testid='caveat-value-input']", "2020-01-01T00:00:00.000Z");
    await page.click("[data-testid='caveat-add']");
    const attenuated = await macaroonOutput(page);

    await page.fill("[data-testid='caveats-input']", attenuated);

    await expect(page.locator("[data-testid='caveat-state-0']")).toHaveAttribute(
      "data-state",
      "expired",
    );
    await expect(page.locator("[data-testid='caveat-origin-0']")).toHaveAttribute(
      "data-state",
      "existing",
    );
  });

  for (const value of ["1", "2", "3600"]) {
    test(`accepts positive integer time limit ${value}`, async ({ page }) => {
      await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
      await page.fill("[data-testid='caveat-seconds-input']", value);
      await page.click("[data-testid='caveat-add-time-limit']");

      await expect(page.locator("[data-testid='caveats-list']")).toContainText("valid-until");
      await expect(page.locator("[data-testid='caveats-error']")).toHaveCount(0);
      await expect(page.locator("[data-testid='caveat-seconds-input']")).toHaveValue("");
    });
  }

  for (const { value, label } of [
    { value: "0", label: "zero" },
    { value: "-1", label: "negative" },
    { value: "1.5", label: "decimal" },
    { value: "1e2", label: "scientific notation" },
    { value: "", label: "empty" },
    { value: "soon", label: "non-numeric" },
  ]) {
    test(`rejects ${label} time limit input`, async ({ page }) => {
      await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
      await page.fill("[data-testid='caveat-seconds-input']", value);
      await page.click("[data-testid='caveat-add-time-limit']");

      await expect(page.locator("[data-testid='caveats-error']")).toContainText(
        "positive whole number",
      );
      await expect(page.locator("[data-testid='caveat-seconds-input']")).toHaveValue(value);
      await expect(page.locator("[data-testid='caveats-list']")).not.toContainText("valid-until");
    });
  }

  test("removes an added caveat", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "origin");
    await page.fill("[data-testid='caveat-value-input']", "example.com");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-list']")).toContainText("origin=example.com");

    await page.click("[data-testid='caveat-remove-0']");
    await expect(page.locator("[data-testid='caveats-list']")).not.toContainText(
      "origin=example.com",
    );
  });

  test("invalid input shows a clear artifact error", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", "this is not a macaroon !!!");
    await expect(page.locator("[data-testid='caveats-input-error']")).toContainText("macaroon");
    await expect(page.locator("[data-testid='status-pill']")).toContainText("error");
  });

  test("missing condition shows an error", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-value-input']", "something");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-error']")).toContainText(
      "Condition is required",
    );
  });

  test("reset clears the input and caveats", async ({ page }) => {
    await page.fill("[data-testid='caveats-input']", FIXTURE_MACAROON);
    await page.fill("[data-testid='caveat-condition-input']", "services");
    await page.fill("[data-testid='caveat-value-input']", "pokedex:0");
    await page.click("[data-testid='caveat-add']");
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();

    await page.click("[data-testid='caveats-reset']");
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue("");
    await expect(page.locator("[data-testid='caveats-empty-hint']")).toBeVisible();
  });

  test("fills a minted macaroon from the Workbench", async ({ page }) => {
    await page.goto("/p/generate");
    await page.fill("[data-testid='generate-token-key-input']", FIXTURE_KEY);
    await page.click("[data-testid='generate-token-mint']");
    const minted = (
      await page.locator("[data-testid='generate-token-output'] pre").first().textContent()
    )?.trim();
    expect(minted).toBeTruthy();

    await page.getByTestId("nav-link-caveats").click();
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue("");
    await page.click("[data-testid='caveats-fill-macaroon']");
    await expect(page.locator("[data-testid='caveats-input']")).toHaveValue(minted ?? "");
    await expect(page.locator("[data-testid='caveats-list']")).toBeVisible();
    // Already-filled: the fill button is now disabled.
    await expect(page.locator("[data-testid='caveats-fill-macaroon']")).toBeDisabled();
    await expect(page.locator("[data-testid='caveats-fill-macaroon']")).toHaveAttribute(
      "aria-label",
      "Macaroon already filled",
    );
  });
});
