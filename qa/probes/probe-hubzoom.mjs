// The zoom from the hub into each room: frames along the way, frame timing, and that the room loads.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const errors = [];
for (const id of ["classroom", "gym", "lunch", "library"]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on("pageerror", (e) => errors.push(id + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(id + ": " + m.text()); });
  await page.goto("http://127.0.0.1:5180/");
  await page.waitForSelector(".school .room .chalk3", { state: "attached" });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    // frame gaps with their times; and the time the room's ease-back (and the fade) starts
    window.__g = []; let last = 0; window.__on = true; window.__flyAt = 0;
    (function f(t) { if (last) window.__g.push([t, t - last]); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now());
    let fn = null;
    Object.defineProperty(window, "__sbEnterFly", { configurable: true, get() { return fn && function () { window.__flyAt = performance.now(); return fn(); }; }, set(v) { fn = v; } });
  });
  await page.locator(`.room[data-room="${id}"]`).click();
  const shots = [150, 400, 800, 1100, 1500, 2600];
  let t = 0;
  for (const at of shots) {
    await page.waitForTimeout(at - t); t = at;
    await page.screenshot({ path: `qa/zoom/${id}-${at}.png` }).catch(() => {});
  }
  const all = id === "library" ? { g: [], at: 0 } : await page.evaluate(() => { window.__on = false; return { g: window.__g, at: window.__flyAt }; });
  // the fade and ease-back run on the main thread: count only those frames (the zoom is a compositor animation)
  const g = all.g.filter((p) => all.at && p[0] > all.at - 440 && p[0] < all.at + 1400).map((p) => p[1]);
  const left = await page.evaluate(() => document.querySelectorAll(".zoom-pic, .zoom-veil").length);
  console.log(id.padEnd(10), "ease-back ran", !!all.at, " url", page.url().replace("http://127.0.0.1:5180", ""), " frames", g.length, "worst", g.length ? Math.max(...g).toFixed(1) : "-", "missed", g.filter((x) => x > 25).length, " overlays left", left);
  await page.close();
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
