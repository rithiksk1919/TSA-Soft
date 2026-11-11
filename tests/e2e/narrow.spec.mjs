// Under 820px: no 3D; a segmented Learn | Practice toggle; drawers as bottom sheets.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, state, WIDTHS } from "./helpers.mjs";

test.use({ viewport: WIDTHS.phone });

test("390px: segmented toggle replaces the arrows and switches scenes", async ({ page }) => {
  await gotoApp(page);
  await expect(page.locator(".seg")).toBeVisible();
  await expect(page.locator("#to-cabinet")).toBeHidden();
  await expect(page.locator("#seg-learn")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#seg-practice").click();
  await settle(page);
  expect(await state(page)).toMatchObject({ scene: 1, aInert: true, bInert: false, focusId: "h-b" });
  await expect(page.locator("#seg-practice")).toHaveAttribute("aria-pressed", "true");
  // No 3D: no lean on the stage at any point is asserted by the flat class and an identity stage.
  expect(await page.evaluate(() => document.documentElement.classList.contains("sb-flat"))).toBe(true);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById("cam-stage")).transform)).toBe("none");
  await page.locator("#seg-learn").click();
  await settle(page);
  expect((await state(page)).scene).toBe(0);
});

test("390px: flat cabinet, drawers open as bottom sheets, the page never scrolls sideways", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#seg-practice").click();
  await settle(page);
  const rig = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById("cab-rig")).transform));
  expect(rig.is2D).toBe(true);
  await page.locator('.dslot[data-id="flashcards"] .drawer').click();
  await settle(page);
  const box = await page.locator("#sheet").boundingBox();
  const vp = page.viewportSize();
  expect(Math.round(box.y + box.height)).toBe(vp.height);   // anchored to the bottom
  expect(Math.round(box.width)).toBe(vp.width);
  await expect(page.locator("#sheet-scrim")).toBeVisible();
  await expect(page.locator("#sheet .icard")).toHaveCount(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Review from the sheet, then Esc back to the sheet, Esc again closes it.
  await page.locator('#sheet [data-review="chem-molar"]').click();
  await settle(page);
  await expect(page.locator("#review-title")).toContainText("Molar mass of a diatomic gas");
  await page.keyboard.press("Escape"); await settle(page);
  await expect(page.locator('#sheet [data-review="chem-molar"]')).toBeFocused();
  await page.keyboard.press("Escape"); await settle(page);
  await expect(page.locator("#sheet")).toBeHidden();
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer')).toBeFocused();
});

test("820px: still the 3D cabinet (the flat layout starts below 820px)", async ({ page }) => {
  await page.setViewportSize(WIDTHS.tablet);
  await gotoApp(page);
  expect(await page.evaluate(() => document.documentElement.classList.contains("sb-flat"))).toBe(false);
  await expect(page.locator(".seg")).toBeHidden();
  await expect(page.locator("#to-cabinet")).toBeVisible();
});
