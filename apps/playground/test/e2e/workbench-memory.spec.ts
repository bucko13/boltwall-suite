import { expect, type Page, test } from "@playwright/test";

import { grantClipboard, readClipboard } from "./setup";

const STORAGE_KEY = "bw.workbench-memory";
const FIXTURE_MEMORY = {
  signingKey: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  macaroon: "AgJCAABmaHqt-workbench-macaroon-fixture",
  challenge: 'L402 macaroon="AgJCAABmaHqt-workbench-macaroon-fixture", invoice="lnbc1demo"',
  credential: "L402 AgJCAABmaHqt-workbench-macaroon-fixture:00000000000000000000000000000000",
};

const SLOT_TEST_IDS = [
  "workbench-memory-key",
  "workbench-memory-macaroon",
  "workbench-memory-challenge",
  "workbench-memory-credential",
] as const;

async function seedWorkbenchMemory(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: FIXTURE_MEMORY },
  );
}

test.describe("Workbench Memory strip", () => {
  test("renders stable empty slots with disabled actions", async ({ page }) => {
    await page.goto("/p/generate");

    await expect(page.getByTestId("workbench-memory-strip")).toBeVisible();
    await expect(page.getByTestId("workbench-memory-clear-all")).toBeVisible();
    await expect(page.getByTestId("workbench-memory-clear-all")).toBeDisabled();

    for (const testId of SLOT_TEST_IDS) {
      await expect(page.getByTestId(testId)).toBeVisible();
      await expect(page.getByTestId(`${testId}-status`)).toHaveText("empty");
      await expect(page.getByTestId(`${testId}-reveal`)).toBeDisabled();
      await expect(page.getByTestId(`${testId}-copy`)).toBeDisabled();
      await expect(page.getByTestId(`${testId}-clear`)).toBeDisabled();
    }
  });

  test("reveals stored values only through an accessible interaction", async ({ page }) => {
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    const macaroon = page.getByTestId("workbench-memory-macaroon");
    await expect(macaroon).toBeVisible();
    await expect(macaroon).not.toContainText(FIXTURE_MEMORY.macaroon);
    await expect(page.getByTestId("workbench-memory-macaroon-popover")).toHaveCount(0);

    await page.getByTestId("workbench-memory-macaroon-reveal").focus();

    const popover = page.getByTestId("workbench-memory-macaroon-popover");
    await expect(popover).toBeVisible();
    await expect(popover).toContainText(FIXTURE_MEMORY.macaroon);
    await expect(page.getByTestId("workbench-memory-macaroon-reveal")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("enables copy and clear controls for populated slots", async ({ context, page }) => {
    await grantClipboard(context);
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    await expect(page.getByTestId("workbench-memory-clear-all")).toBeEnabled();
    await expect(page.getByTestId("workbench-memory-macaroon-status")).toHaveText("stored");
    await expect(page.getByTestId("workbench-memory-macaroon-copy")).toBeEnabled();
    await expect(page.getByTestId("workbench-memory-macaroon-clear")).toBeEnabled();

    await page.getByTestId("workbench-memory-macaroon-copy").click();
    await expect.poll(() => readClipboard(page)).toBe(FIXTURE_MEMORY.macaroon);

    await page.getByTestId("workbench-memory-macaroon-clear").click();
    await expect(page.getByTestId("workbench-memory-macaroon-status")).toHaveText("empty");
    await expect(page.getByTestId("workbench-memory-macaroon-copy")).toBeDisabled();
    await expect(page.getByTestId("workbench-memory-key-status")).toHaveText("stored");

    await page.getByTestId("workbench-memory-clear-all").click();
    for (const testId of SLOT_TEST_IDS) {
      await expect(page.getByTestId(`${testId}-status`)).toHaveText("empty");
      await expect(page.getByTestId(`${testId}-copy`)).toBeDisabled();
      await expect(page.getByTestId(`${testId}-clear`)).toBeDisabled();
    }
    await expect(page.getByTestId("workbench-memory-clear-all")).toBeDisabled();
  });

  test("slot dimensions do not change when memory values are cleared", async ({ page }) => {
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    const before = await Promise.all(
      SLOT_TEST_IDS.map((testId) => page.getByTestId(testId).boundingBox()),
    );

    await page.getByTestId("workbench-memory-clear-all").click();

    const after = await Promise.all(
      SLOT_TEST_IDS.map((testId) => page.getByTestId(testId).boundingBox()),
    );

    expect(after).toHaveLength(before.length);
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index]?.width).toBe(before[index]?.width);
      expect(after[index]?.height).toBe(before[index]?.height);
    }
  });
});
