// prefers-reduced-motion: no springs, no parallax, no tilt; 150ms crossfades.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, state, openDrawer } from "./helpers.mjs";

test.use({ reducedMotion: "reduce" });

// Count frames on which any spring was running, for a window of time.
const springFrames = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  let n = 0; const t0 = performance.now();
  (function f() { if (window.SkillBridge.activeSprings() > 0) n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(n); })();
}), ms);

test("reduced motion: no tilt or lean, scenes swap with a 150ms crossfade, no springs run", async ({ page }) => {
  await gotoApp(page);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById("rig")).transform)).toBe("none");
  expect(await page.evaluate(() => document.documentElement.classList.contains("sb-flat"))).toBe(true);
  const watching = springFrames(page, 900);
  const fades = page.evaluate(() => new Promise((res) => {
    const seen = new Set(); const t0 = performance.now();
    (function f() {
      document.getAnimations().forEach((a) => { const d = a.effect.getTiming().duration; if (typeof d === "number" && d > 0) seen.add(d); });
      if (performance.now() - t0 < 600) requestAnimationFrame(f); else res([...seen]);
    })();
  }));
  await page.locator("#to-cabinet").click();
  const durations = await fades;
  expect(await watching).toBe(0);
  expect(durations).toContain(150);
  expect(durations.every((d) => d <= 150)).toBe(true);
  await settle(page);
  const s = await state(page);
  expect(s).toMatchObject({ scene: 1, p: 1, aInert: true, bInert: false, focusId: "h-b" });
  expect(await page.evaluate(() => getComputedStyle(document.getElementById("cam-stage")).transform)).toBe("none");
  // The cabinet is flat: no rotation on the rig.
  const rig = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.getElementById("cab-rig")).transform));
  expect(Math.abs(rig.m13) + Math.abs(rig.m23) + Math.abs(rig.m31) + Math.abs(rig.m32)).toBeLessThan(1e-6);
});

test("reduced motion: drawer opens as a sheet without springs; review and flip have no motion", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#to-cabinet").click();
  await settle(page);
  const watching = springFrames(page, 1200);
  await page.locator('.dslot[data-id="flashcards"] .drawer').click();
  await settle(page);
  expect(await page.evaluate(() => window.SkillBridge.debug.panel())).toBe("flashcards");
  await page.locator("#sheet [data-review-all]").click();
  await settle(page);
  await page.locator(".rcard__front .ropt").first().click();
  expect(await watching).toBe(0);
  // The card shows its back immediately: rotateY(180deg).
  const m = await page.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector(".rcard")).transform));
  expect(m.m11).toBeCloseTo(-1, 3);
  // Logos do not animate.
  const anim = await page.evaluate(() => [...document.querySelectorAll(".logo .a")].map((n) => getComputedStyle(n).animationName));
  expect(anim.every((a) => a === "none")).toBe(true);
});

test("reduced motion: opening a book is a 150ms crossfade straight to flat pages", async ({ page }) => {
  await gotoApp(page);
  const durations = page.evaluate(() => new Promise((res) => {
    const seen = new Set(); const t0 = performance.now();
    (function f() { document.getAnimations().forEach((a) => { const d = a.effect.getTiming().duration; if (typeof d === "number" && d > 0 && a.effect.getTiming().iterations !== Infinity) seen.add(d); }); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res([...seen]); })();
  }));
  await page.locator('.book[data-id="biology"]').click();
  expect(await durations).toEqual([150]);
  await settle(page);
  await expect(page.locator("#reader")).toHaveClass(/is-open/);
});

test("reduced motion: every drawer opens without springs; the stamp appears without the press", async ({ page }) => {
  await gotoApp(page);
  await page.locator("#to-cabinet").click();
  await settle(page);
  for (const i of [1, 2, 3, 4, 5]) {
    const watching = springFrames(page, 700);
    await page.locator(`.dslot[data-i="${i}"] .drawer`).click();
    expect(await watching).toBe(0);
    await settle(page);
    if (i === 5) {
      const st = await page.evaluate(() => [...document.querySelectorAll("#sheet .stamp")].map((n) => [n.style.opacity, n.style.transform]));
      expect(st.length).toBe(2);
      for (const [o, t] of st) { expect(o).toBe(""); expect(t).toBe(""); }
    }
    await page.keyboard.press("Escape");
    await settle(page);
  }
});
