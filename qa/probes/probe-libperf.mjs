// The library room's cost: element counts, expensive styles, and frame timing while the camera
// leans with the pointer and flies to each station and back. GPU on.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://127.0.0.1:5180/library/");
await page.waitForFunction(() => window.SkillBridge && window.SkillBridge.room && window.SkillBridge.room.state() === "overview", null, { timeout: 15000 });
await page.waitForTimeout(1500);
const stats = await page.evaluate(() => {
  const all = [...document.querySelectorAll("#room *")];
  const cs = all.map((e) => [e, getComputedStyle(e)]);
  const count = (f) => cs.filter(([e, s]) => f(e, s)).length;
  return {
    elements: all.length,
    faces: document.querySelectorAll("#room .f3, #room .p3").length,
    preserve3d: count((e, s) => s.transformStyle === "preserve-3d"),
    filters: count((e, s) => s.filter !== "none"),
    bigShadows: count((e, s) => /(\d{2,})px (\d{2,})px/.test(s.boxShadow) || /\b([3-9]\d|\d{3})px\b/.test(s.boxShadow)),
    gradients: count((e, s) => s.backgroundImage.includes("gradient")),
    willChange: count((e, s) => s.willChange !== "auto"),
    blend: count((e, s) => s.mixBlendMode !== "normal"),
    backdrop: count((e, s) => (s.backdropFilter || "none") !== "none"),
    animations: document.getAnimations().length
  };
});
console.log(JSON.stringify(stats));
async function timed(label, fn, ms) {
  await page.evaluate(() => { window.__g = []; let last = 0; window.__on = true; (function f(t) { if (last) window.__g.push(t - last); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now()); });
  await fn();
  await page.waitForTimeout(ms);
  const g = await page.evaluate(() => { window.__on = false; return window.__g; });
  const avg = g.reduce((a, b) => a + b, 0) / g.length;
  console.log(label.padEnd(18), "fps", (1000 / avg).toFixed(0).padStart(3), " worst", Math.max(...g).toFixed(0).padStart(4), "ms  missed", g.filter((x) => x > 25).length, "of", g.length);
}
await timed("idle", async () => {}, 1500);
await timed("pointer lean", async () => { for (let i = 0; i < 30; i++) await page.mouse.move(200 + i * 40, 300 + (i % 5) * 60); }, 600);
for (const st of ["learn", "apply", "practice"]) {
  await timed("fly " + st, async () => { await page.locator(`.rnav__btn[data-station="${st}"]`).click(); }, 1800);
  await timed("back from " + st, async () => { await page.keyboard.press("Escape"); }, 1800);
  await page.waitForTimeout(500);
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
