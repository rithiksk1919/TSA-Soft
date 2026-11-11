// Scene transition: arrows, mid-move reversal, spam clicks, inert timing, heading crossfade.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, state, watch } from "./helpers.mjs";

test("arrow to the cabinet and back; offscreen scene inert and hidden only after settling", async ({ page }) => {
  const problems = watch(page);
  await gotoApp(page);
  await page.locator("#to-cabinet").click();
  await page.waitForTimeout(120);
  const mid = await state(page);
  expect(mid.aInert).toBe(false);              // not before the move settles
  expect(mid.bInert).toBe(false);
  expect(mid.p).toBeGreaterThan(0);
  expect(mid.p).toBeLessThan(1);
  await settle(page);
  const b = await state(page);
  expect(b).toMatchObject({ scene: 1, p: 1, aInert: true, bInert: false, aVis: "hidden", bVis: "visible", focusId: "h-b", live: "Practice your mistakes" });
  expect(await page.locator("#cam-stage").evaluate((n) => getComputedStyle(n).transform)).toBe("none");   // lean settled flat
  await page.locator("#to-shelf").click();
  await settle(page);
  expect(await state(page)).toMatchObject({ scene: 0, p: 0, aInert: false, bInert: true, aVis: "visible", bVis: "hidden", focusId: "h-a", live: "Learn your mistakes" });
  expect(problems).toEqual([]);
});

test("reverse mid-move keeps velocity and settles back", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#to-cabinet").click();
  await page.waitForTimeout(260);
  const p1 = (await state(page)).p;
  await page.locator("#to-shelf").click();        // the back arrow is live during the move
  // Velocity is kept: p keeps rising for a moment before turning back.
  await page.waitForTimeout(32);
  const p2 = (await state(page)).p;
  expect(p2).toBeGreaterThanOrEqual(p1 - 0.02);
  await settle(page);
  expect(await state(page)).toMatchObject({ scene: 0, p: 0, aInert: false, bInert: true });
});

test("spam-click the arrows 10 times: the final state is consistent", async ({ page }) => {
  await gotoApp(page);
  for (let i = 0; i < 10; i++) {
    await page.locator(i % 2 ? "#to-shelf" : "#to-cabinet").click({ force: true });
    await page.waitForTimeout(40);
  }
  await settle(page);
  const s = await state(page);
  // The last click was #to-shelf (i = 9): the shelf.
  expect(s).toMatchObject({ scene: 0, p: 0, aInert: false, bInert: true, aVis: "visible", bVis: "hidden" });
  const op = await page.evaluate(() => [getComputedStyle(document.getElementById("intro")).opacity, getComputedStyle(document.getElementById("intro-b")).opacity]);
  expect(op).toEqual(["1", "0"]);
});

test("headings crossfade with p: never both faint, never the wrong one in front", async ({ page }) => {
  await gotoApp(page);
  const frames = page.evaluate(() => new Promise((res) => {
    const out = []; const t0 = performance.now();
    (function f() {
      const a = +getComputedStyle(document.getElementById("intro")).opacity;
      const b = +getComputedStyle(document.getElementById("intro-b")).opacity;
      out.push({ a, b, p: window.SkillBridge.debug.p() });
      if (performance.now() - t0 < 1600) requestAnimationFrame(f); else res(out);
    })();
  }));
  await page.locator("#to-cabinet").click();
  const fr = await frames;
  for (const f of fr) {
    expect(Math.abs(f.a + f.b - 1)).toBeLessThan(0.02);   // opacities always sum to 1
    expect(f.b).toBeLessThanOrEqual(Math.min(1, Math.max(0, f.p)) + 0.01);
  }
});

test("parallax layers move at 0.6x / 1.0x / 1.12x of the track", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#to-cabinet").click();
  await settle(page);
  const x = await page.evaluate(() => {
    const tx = (q) => new DOMMatrix(getComputedStyle(document.querySelector(q)).transform).m41;
    return { sw: document.getElementById("world").clientWidth, wall: tx(".layer--wall"), track: tx(".track"), floor: tx(".layer--floor") };
  });
  expect(x.track / -x.sw).toBeCloseTo(1, 3);
  expect(x.wall / -x.sw).toBeCloseTo(0.6, 3);
  expect(x.floor / -x.sw).toBeCloseTo(1.12, 3);
});
