import { expect, type Page, test } from "@playwright/test";

import { grantClipboard, readClipboard } from "./setup";

const STORAGE_KEY = "bw.workbench-memory";
const FIXTURE_MEMORY = {
  signingKey: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
  macaroon: "AgJCAABmaHqt-workbench-macaroon-fixture",
  challenge: 'L402 macaroon="AgJCAABmaHqt-workbench-macaroon-fixture", invoice="lnbc1demo"',
  credential: "L402 AgJCAABmaHqt-workbench-macaroon-fixture:00000000000000000000000000000000",
};
const REPLACEMENT_KEY = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

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

  test("keeps the revealed value open while the pointer moves into the popover", async ({
    page,
  }) => {
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    const reveal = page.getByTestId("workbench-memory-macaroon-reveal");
    await reveal.hover();

    const popover = page.getByTestId("workbench-memory-macaroon-popover");
    await expect(popover).toBeVisible();

    const box = await popover.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(popover).toBeVisible();
    await expect(popover).toContainText(FIXTURE_MEMORY.macaroon);
  });

  test("keeps the revealed value open after a mobile tap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    const reveal = page.getByTestId("workbench-memory-macaroon-reveal");
    await reveal.click();

    const popover = page.getByTestId("workbench-memory-macaroon-popover");
    await expect(popover).toBeVisible();
    await popover.click();

    await expect(popover).toBeVisible();
    await expect(popover).toContainText(FIXTURE_MEMORY.macaroon);
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

  test("announces producer writes, replacements, and slot clears without values", async ({
    page,
  }) => {
    await page.goto("/p/generate");

    const feedback = page.getByTestId("workbench-memory-feedback");
    await page.getByTestId("generate-token-key-input").fill(FIXTURE_MEMORY.signingKey);
    await expect(page.getByTestId("workbench-memory-key-status")).toHaveText("stored");
    await expect(feedback).toHaveText("Workbench updated.");
    await expect(feedback).not.toContainText(FIXTURE_MEMORY.signingKey);
    await expect(page.getByTestId("workbench-memory-key")).toHaveAttribute("data-updated", "true");
    await expect(page.getByTestId("workbench-memory-key-feedback")).toHaveText("updated");

    await page.getByTestId("generate-token-key-input").fill(REPLACEMENT_KEY);
    await expect(page.getByTestId("generate-token-key-input")).toHaveValue(REPLACEMENT_KEY);
    await expect(feedback).toHaveText("Workbench updated.");
    await expect(feedback).not.toContainText(REPLACEMENT_KEY);
    await expect(page.getByTestId("workbench-memory-key")).toHaveAttribute("data-updated", "true");

    await page.getByTestId("workbench-memory-key-clear").click();
    await expect(page.getByTestId("workbench-memory-key-status")).toHaveText("empty");
    await expect(feedback).toHaveText("Workbench updated.");
    await expect(page.getByTestId("workbench-memory-key")).toHaveAttribute("data-updated", "true");
  });

  test("clear all reports one accessible Workbench confirmation", async ({ page }) => {
    await seedWorkbenchMemory(page);
    await page.goto("/p/generate");

    const feedback = page.getByTestId("workbench-memory-feedback");
    await expect(feedback).toHaveAttribute("role", "status");
    await expect(feedback).toHaveAttribute("aria-live", "polite");

    await page.getByTestId("workbench-memory-clear-all").click();
    await expect(feedback).toHaveText("Workbench updated.");
    await expect(feedback).not.toContainText(FIXTURE_MEMORY.macaroon);

    for (const testId of SLOT_TEST_IDS) {
      await expect(page.getByTestId(`${testId}-status`)).toHaveText("empty");
      await expect(page.getByTestId(testId)).toHaveAttribute("data-updated", "true");
    }
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
