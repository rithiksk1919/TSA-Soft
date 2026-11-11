// Each drawer has its own interior and signature motion; it plays on open and is home after close.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, toCabinet, WIDTHS } from "./helpers.mjs";

const DRAWERS = [[1, "index", 6], [2, "worked", 5], [3, "diagnostic", 15], [4, "history", 15], [5, "learned", 3]];

// Largest lift (negative y) of any piece inside a drawer, from the inline transforms.
// (The stamp rests hidden above the cards, so it is checked by its opacity instead.)
const maxLift = (page, id) => page.evaluate((id) => Math.max(0, ...[...document.querySelectorAll(`.dcontents--${id} .ipiece:not(.istamp)`)]
  .map((n) => -new DOMMatrix(getComputedStyle(n).transform).m42)), id);

for (const [i, id, minPieces] of DRAWERS) {
  test(`${id}: interior plays its signature motion on open and is home after close`, async ({ page }) => {
    await gotoApp(page);
    await toCabinet(page);
    // Watch for movement while the drawer opens.
    const peak = page.evaluate((id) => new Promise((res) => {
      let best = 0; const t0 = performance.now();
      (function f() {
        document.querySelectorAll(`.dcontents--${id} .ipiece`).forEach((n) => { best = Math.max(best, -new DOMMatrix(getComputedStyle(n).transform).m42, Math.abs(new DOMMatrix(getComputedStyle(n).transform).m43)); });
        if (performance.now() - t0 < 3200) requestAnimationFrame(f); else res(best);
      })();
    }), id);
    await page.locator(`.dslot[data-i="${i}"] .drawer`).click();
    expect(await peak).toBeGreaterThan(20);
    await settle(page);
    expect(await page.locator(`.dcontents--${id} .ipiece`).count()).toBeGreaterThanOrEqual(minPieces);
    expect(await page.evaluate(() => window.SkillBridge.debug.panel())).toBe(id);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await maxLift(page, id)).toBeLessThan(0.5);
    if (id === "learned") expect(await page.evaluate(() => getComputedStyle(document.querySelector(".istamp")).opacity)).toBe("0");
  });
}

test("flat mode (390px): no drawer interiors, the sheet opens straight away", async ({ page }) => {
  await page.setViewportSize(WIDTHS.phone);
  await gotoApp(page);
  await page.locator("#seg-practice").click();
  await settle(page);
  await page.locator('.dslot[data-id="index"] .drawer').click();
  await settle(page);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector(".dcontents--index")).display)).toBe("none");
  expect(await page.evaluate(() => window.SkillBridge.debug.panel())).toBe("index");
});
