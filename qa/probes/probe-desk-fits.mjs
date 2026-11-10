// Counts how often the desk refits (stage style writes) during the first 9s of tutoring, and the final
// stage geometry, at desk widths. usage: node qa/probes/probe-desk-fits.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [1000, 700]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript(() => { window.__fits = 0; const g = Element.prototype.getBoundingClientRect; Element.prototype.getBoundingClientRect = function () { if (this.classList && this.classList.contains("dk-stage")) window.__fits++; return g.call(this); }; });
  await p.goto("http://127.0.0.1:5180/#desk"); await p.waitForTimeout(9000);
  const g = await p.evaluate(() => { const d = document.querySelector(".desk"), s = document.querySelector(".dk-stage"); return [s.style.height, s.style.perspective, d.style.getPropertyValue("--wall-end"), d.style.getPropertyValue("--floor-start"), d.style.getPropertyValue("--dock-h")].join(" "); });
  await p.evaluate(() => window.dispatchEvent(new Event("resize"))); await p.waitForTimeout(300);
  const g2 = await p.evaluate(() => { const d = document.querySelector(".desk"), s = document.querySelector(".dk-stage"); return [s.style.height, s.style.perspective, d.style.getPropertyValue("--wall-end"), d.style.getPropertyValue("--floor-start"), d.style.getPropertyValue("--dock-h")].join(" "); });
  console.log(w, JSON.stringify({ fitCalls: await p.evaluate(() => window.__fits), final: g, sameAsRefit: g === g2 }));
  await p.close();
}
await b.close();
