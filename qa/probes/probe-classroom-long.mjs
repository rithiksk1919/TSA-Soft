// Which work makes the one long frame when a classroom station opens: long tasks and the frame gaps
// around the moment the panel is added.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5180/#/classroom");
await page.waitForSelector(".c3cam .c3board");
await page.waitForTimeout(800);
for (const st of ["watch", "listen", "read"]) {
  await page.evaluate(() => {
    window.__log = [];
    window.__lt = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask" });
    let last = 0;
    window.__on = true;
    (function f(t) { if (last && t - last > 25) window.__log.push([Math.round(last), Math.round(t - last)]); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now());
    const mo = new MutationObserver(() => { window.__panelAt = Math.round(performance.now()); mo.disconnect(); });
    mo.observe(document.getElementById("panel-root"), { childList: true });
  });
  await page.locator(`.bar [data-station="${st}"]`).click();
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => { window.__on = false; return { gaps: window.__log, longtasks: window.__lt, panelAt: window.__panelAt }; });
  console.log(st, JSON.stringify(r));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
}
await browser.close();
