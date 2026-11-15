// The hub with the "Your mistakes" panel on the right (screenshots at a few sizes).
import { chromium } from "playwright";
const b = await chromium.launch({ headless: true });
for (const [w, h] of [[1920, 1080], [1366, 768], [1000, 800]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:8000/");
  await p.waitForSelector(".mk, .mk-note:not(:empty)");
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `qa/extension/hub-${w}.png` });
  const below = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  console.log(w + "x" + h, "| mistakes shown:", await p.locator(".mk").count(), "| page scrolls below the school by", below, "px |", errs.join("; ") || "no errors");
  await p.close();
}
await b.close();
