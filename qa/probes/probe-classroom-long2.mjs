// Bisect the long frame on opening a station: with the panel's rise, the chalk-in, both, or neither.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
for (const [label, css] of [["as is", ""], ["scrim still", "#panel-root .scrim{animation:none!important}"], ["as is 2", ""], ["scrim still 2", "#panel-root .scrim{animation:none!important}"]]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto("http://127.0.0.1:5180/#/classroom");
  await page.waitForSelector(".c3cam .c3board");
  if (css) await page.addStyleTag({ content: css });
  await page.waitForTimeout(800);
  const out = [];
  for (const st of ["watch", "read"]) {
    await page.evaluate(() => {
      window.__log = []; let last = 0; window.__on = true;
      (function f(t) { if (last && t - last > 25) window.__log.push(Math.round(t - last)); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now());
    });
    await page.locator(`.bar [data-station="${st}"]`).click();
    await page.waitForTimeout(1500);
    out.push(st + ":" + JSON.stringify(await page.evaluate(() => { window.__on = false; return window.__log; })));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
  }
  console.log(label.padEnd(12), out.join("  "));
  await page.close();
}
await browser.close();
