// Measures the dashboard's data regions after load, and the layout shift (CLS) during load.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [1100, 800], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  });
  await p.route("**/dashboard.mock.json", async r => { await new Promise(f => setTimeout(f, 400)); r.continue(); });
  await p.goto("http://127.0.0.1:5180/dashboard.html");
  await p.waitForSelector("html.is-ready"); await p.waitForTimeout(500);
  const m = await p.evaluate(() => Object.fromEntries(["summary", "stats", "repeat-rows", "trend-chart", "due-rows", "log-rows", "books3d", "next-test-name", "next-test-when"].map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().height)])));
  console.log(w, "CLS", (await p.evaluate(() => window.__cls)).toFixed(4), JSON.stringify(m));
  await p.close();
}
await b.close();
