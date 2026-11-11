import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const b = await chromium.launch();
for (const w of [1440, 390]) {
  const c = await b.newContext({ viewport: { width: w, height: 900 } }); const p = await c.newPage();
  await p.goto("http://127.0.0.1:5180/dashboard.html"); await p.waitForSelector("html.is-ready");
  const r = await new AxeBuilder({ page: p }).analyze();
  console.log(w, r.violations.length ? r.violations.map(v => v.id + ": " + v.nodes.map(n => n.target.join(" ")).join(", ")).join("\n") : "no violations");
}
await b.close();
