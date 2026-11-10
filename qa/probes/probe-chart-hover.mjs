// Hovers each week of the trend chart and records the tooltip box and text; then leaves. usage: node qa/probes/probe-chart-hover.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto("http://127.0.0.1:5180/dashboard.html"); await p.waitForSelector("html.is-ready"); await p.waitForTimeout(300);
  const out = [];
  for (const i of [0, 1, 2, 3]) {
    await p.hover(`#trend-chart .hit[data-i="${i}"]`);
    out.push(await p.evaluate(() => { const t = document.getElementById("trend-tip"), r = t.getBoundingClientRect(), f = document.getElementById("trend-chart").getBoundingClientRect(); return [t.hidden, Math.round(r.left - f.left), Math.round(r.right - f.left), Math.round(r.top - f.top), t.textContent.replace(/\s+/g, " ").slice(0, 40), document.getElementById("trend-guide").getAttribute("visibility")]; }));
  }
  await p.mouse.move(2, 2);
  out.push(await p.evaluate(() => [document.getElementById("trend-tip").hidden, document.getElementById("trend-guide").getAttribute("visibility")]));
  console.log(w, JSON.stringify(out));
  await p.close();
}
await b.close();
