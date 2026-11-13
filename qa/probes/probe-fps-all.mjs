// Frame rate of every room while its camera moves with the pointer: median of several runs (the
// machine is shared, so single runs are noisy). Optional CSS to inject for A/B: node ... "<css>"
import { chromium } from "@playwright/test";
const css = process.argv[2] || "";
const only = process.argv[3] || "";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const rooms = [
  ["hub", "/", ".school .room .chalk3"],
  ["classroom", "/#/classroom", ".c3board"],
  ["lunch", "/#/lunch", ".menu3"],
  ["gym", "/#/gym", ".sb3__face"],
  ["library", "/library/", "#world3 .spines3"]
].filter((r) => !only || only.split(",").includes(r[0]));
for (const [name, url, sel] of rooms) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://127.0.0.1:5180" + url);
  await page.waitForSelector(sel, { state: "attached", timeout: 15000 });
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(1500);
  const runs = [];
  for (let r = 0; r < 5; r++) {
    await page.evaluate(() => { window.__g = []; let last = 0; window.__on = true; (function f(t) { if (last) window.__g.push(t - last); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now()); });
    for (let i = 0; i < 24; i++) await page.mouse.move(150 + ((i * 53) % 1300), 250 + ((i * 37) % 450), { steps: 2 });
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => { window.__on = false; return window.__g; });
    runs.push(1000 / (g.reduce((a, b) => a + b, 0) / g.length));
    await page.mouse.move(5, 5); await page.waitForTimeout(500);
  }
  runs.sort((a, b) => a - b);
  console.log(name.padEnd(10), "median fps", runs[2].toFixed(0).padStart(3), "  runs", runs.map((x) => x.toFixed(0)).join(" "));
  await page.close();
}
await browser.close();
