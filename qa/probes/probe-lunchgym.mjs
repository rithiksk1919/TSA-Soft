// The 3D lunchroom and gym: screenshots, the break running, a made and a missed shot, frame timing.
import { chromium } from "@playwright/test";
const W = Number(process.argv[2] || 1600), H = Number(process.argv[3] || 900);
const tag = process.argv[4] || "w";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.addInitScript(() => {
  window.__f = { on: false, last: 0, gaps: [] };
  (function loop(t) { const f = window.__f; if (f.on) { if (f.last) f.gaps.push(t - f.last); f.last = t; } requestAnimationFrame(loop); })(0);
});
const start = () => page.evaluate(() => { window.__f.on = true; window.__f.last = 0; window.__f.gaps = []; });
const stop = async (label) => {
  const g = await page.evaluate(() => { window.__f.on = false; return window.__f.gaps; });
  console.log(label.padEnd(20), "frames", g.length, "worst", g.length ? Math.max(...g).toFixed(1) : "-", "missed", g.filter((x) => x > 25).length);
};
const out = `qa/school3d/${tag}`;

await page.goto("http://127.0.0.1:5180/#/lunch");
await page.waitForSelector("#lunch-stage .menu3");
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}-lunch.png` });
await start();
await page.locator("#break-start").click();
await page.waitForTimeout(4000);
await stop("lunch: break running");
await page.screenshot({ path: `${out}-lunch-break.png` });
await page.locator("#break-start").click();

await page.goto("http://127.0.0.1:5180/#/gym");
await page.waitForSelector("#gym-stage .sb3__face");
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}-gym.png` });
// shots: drive the 3D ball directly (the game itself needs a skill at mastery 0.80)
for (const made of [true, false]) {
  await start();
  await page.evaluate((m) => { window.__shot = window.__gymShoot(m); }, made);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}-gym-shot-${made ? "made" : "miss"}-a.png` });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}-gym-shot-${made ? "made" : "miss"}-b.png` });
  await page.evaluate(() => window.__shot);
  await stop("gym: shot " + (made ? "made" : "missed"));
  await page.screenshot({ path: `${out}-gym-shot-${made ? "made" : "miss"}-end.png` });
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
