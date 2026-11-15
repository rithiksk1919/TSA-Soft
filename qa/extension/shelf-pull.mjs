// The middle shelf with your books, and the pull-out of one of them (frames), compared with Python.
// usage: node qa/extension/shelf-pull.mjs <book id, e.g. my-chem>
import { chromium } from "playwright";
const id = process.argv[2] || "my-chem";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://127.0.0.1:8000/library/");
await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="learn"]');
await p.waitForTimeout(1800);
await p.screenshot({ path: "qa/extension/pull-0-shelf.png" });
for (const book of [id, "python"]) {
  await p.click('.rbooks__btn[data-book="' + book + '"]');
  for (const ms of [120, 260, 420]) {
    await p.waitForTimeout(ms === 120 ? 120 : 140);
    await p.screenshot({ path: `qa/extension/pull-${book}-${ms}.png`, clip: { x: 200, y: 0, width: 1200, height: 900 } });
  }
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `qa/extension/pull-${book}-open.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(2500);
}
await p.screenshot({ path: "qa/extension/pull-9-after.png" });
const spot = await p.$$eval(".addspot", (n) => n.length);
console.log("placards:", spot, "|", errs.join("\n") || "no page errors");
await b.close();
