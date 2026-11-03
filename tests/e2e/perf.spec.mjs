// Frame times in the heaviest animations, with 4x CPU throttling; layout shift on load.
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { gotoApp, settle } from "./helpers.mjs";

const results = {};

// Measure the page, not the harness: no trace recording (DOM snapshots per action), and actions
// are dispatched in the page so Playwright's per-frame actionability checks do not run meanwhile.
test.use({ trace: "off" });
const press = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);

async function measure(page, label, ms, action) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const frames = page.evaluate((ms) => new Promise((res) => {
    const dts = []; let last = performance.now(); const t0 = last;
    (function f(now) { dts.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(f); else res(dts.slice(2)); })(last);
  }), ms);
  await action();
  const dts = await frames;
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const sorted = [...dts].sort((a, b) => a - b);
  const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const r = { frames: dts.length, avgFps: +(1000 / mean).toFixed(1), p95FrameMs: +p95.toFixed(1), worstMs: +sorted.at(-1).toFixed(1) };
  results[label] = r;
  return r;
}

test.afterAll(() => {
  mkdirSync("qa", { recursive: true });
  writeFileSync("qa/perf.json", JSON.stringify(results, null, 2));
});

test("no layout shift on load", async ({ page }) => {
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await gotoApp(page);
  const cls = await page.evaluate(() => window.__cls);
  results.cls = +cls.toFixed(4);
  expect(cls).toBeLessThan(0.01);
});

test("frame rate under 4x CPU throttling: book open, camera move, drawer open", async ({ page }) => {
  await gotoApp(page);
  const book = await measure(page, "book open (1.9s sequence)", 2100, () => press(page, '.book[data-id="physics"]'));
  await settle(page);
  await page.keyboard.press("Escape");
  await settle(page);
  const camera = await measure(page, "camera move to cabinet", 1300, () => press(page, "#to-cabinet"));
  await settle(page);
  const drawer = await measure(page, "flashcards drawer open + pop", 1800, () => press(page, '.dslot[data-id="flashcards"] .drawer'));
  await settle(page);
  const close = await measure(page, "flashcards drawer close", 1600, () => page.keyboard.press("Escape"));
  console.log(JSON.stringify(results, null, 1));
  // Target >= 50 fps; anything under 40 fps fails.
  for (const r of [book, camera, drawer, close]) expect(r.avgFps).toBeGreaterThanOrEqual(40);
});
