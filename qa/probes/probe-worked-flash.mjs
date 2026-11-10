// Reveals every step of the first worked example, then samples each earlier step's opacity for 600ms
// after the last click: a step dropping toward 0 is the flash DJ1 describes. usage: node qa/probes/probe-worked-flash.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
await p.goto("http://127.0.0.1:5180/#test-practice");
await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6 && window.SkillBridge.debug.scene() === 1);
await p.waitForTimeout(1500);
await p.locator('.dslot[data-i="2"] .drawer').click(); await p.waitForTimeout(2500);
await p.locator("#sheet .icard").first().click(); await p.waitForTimeout(1200);
while (await p.locator("#sheet [data-next]").count() > 1 || (await p.locator("#sheet [data-next]").count() === 1 && await p.evaluate(() => { const n = document.querySelectorAll("#sheet .step").length; return n; }) < 99)) {
  const before = await p.locator("#sheet .step").count();
  const last = await p.evaluate(() => { const st = document.querySelector("#sheet [data-count]").textContent; const m = /(\d+) of (\d+)/.exec(st); return +m[1] + 1 === +m[2]; });
  if (last) {
    const samples = await p.evaluate(() => new Promise(res => {
      const out = []; document.querySelector("#sheet [data-next]").click();
      const t0 = performance.now();
      (function f() {
        const steps = [...document.querySelectorAll("#sheet .step")].slice(0, -1);
        out.push(Math.min(...steps.map(s => +getComputedStyle(s).opacity)));
        if (performance.now() - t0 < 600) requestAnimationFrame(f); else res(out);
      })();
    }));
    console.log("min opacity of earlier steps after the last reveal:", Math.min(...samples).toFixed(2), "check box shown:", await p.locator("#sheet [data-check]").isVisible());
    break;
  }
  await p.locator("#sheet [data-next]").click(); await p.waitForTimeout(500);
  if (await p.locator("#sheet .step").count() === before) break;
}
await b.close();
