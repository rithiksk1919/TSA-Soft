// Screenshots of dashboard.html at 1440x900 and 390x844 (full page + first screen). Run: node qa/probes/shot-dashboard.mjs [tag]
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "v1";
const base = "http://127.0.0.1:5180/dashboard.html";
const browser = await chromium.launch();
for (const [w, h, scale] of [[1440, 900, 1], [390, 844, 2]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const errs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => m.type() === "error" && errs.push(m.text()));
  await page.goto(base);
  await page.waitForSelector("html.is-ready");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.screenshot({ path: `qa/dashboard/${tag}-${w}-full.png`, fullPage: true });
  await page.screenshot({ path: `qa/dashboard/${tag}-${w}.png` });
  console.log(w, "overflowX:", over, "errors:", errs.join(" | ") || "none");
  await page.close();
}
await browser.close();
