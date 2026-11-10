// Opens the reading desk and compares the stage size measured at open with a refit afterwards
// (a resize event). A difference means open() measured an unfinished desk (DK1). Also switches
// scenario tabs and compares again. usage: node qa/probes/probe-desk-fit.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [1000, 800]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:5180/#desk"); await p.waitForTimeout(2500);
  const read = () => p.evaluate(() => { const d = document.querySelector(".desk"), s = d.querySelector(".dk-stage") || document.querySelector("[class*=stage]"); return [s.style.height, d.style.getPropertyValue("--wall-end"), d.style.getPropertyValue("--floor-start")].join(" "); });
  const atOpen = await read();
  await p.evaluate(() => window.dispatchEvent(new Event("resize"))); await p.waitForTimeout(300);
  const refit = await read();
  const tabs = p.locator(".desk [role=tab], .desk .dk-tab, .desk [data-scenario]");
  let afterTab = "n/a", afterTabRefit = "n/a";
  if (await tabs.count() > 1) {
    await tabs.nth(1).click(); await p.waitForTimeout(800); afterTab = await read();
    await p.evaluate(() => window.dispatchEvent(new Event("resize"))); await p.waitForTimeout(300); afterTabRefit = await read();
  }
  console.log(w, JSON.stringify({ atOpen, refit, same: atOpen === refit, afterTab, afterTabRefit, tabSame: afterTab === afterTabRefit }));
  await p.close();
}
await b.close();
