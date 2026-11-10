import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.addInitScript(() => { window.__s = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__s.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: e.sources.map(s => (s.node && (s.node.id || s.node.className || s.node.nodeName)) + " " + s.previousRect.height + "->" + s.currentRect.height + " y" + s.previousRect.y + "->" + s.currentRect.y) }); }).observe({ type: "layout-shift", buffered: true }); });
await p.route("**/dashboard.mock.json", async r => { await new Promise(f => setTimeout(f, 400)); r.continue(); });
await p.goto("http://127.0.0.1:5180/dashboard.html"); await p.waitForSelector("html.is-ready"); await p.waitForTimeout(500);
console.log(JSON.stringify(await p.evaluate(() => window.__s), null, 1));
await b.close();
