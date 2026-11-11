import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
const r = await p.evaluate(() => { const b = document.querySelector(".case-back").getBoundingClientRect(); return { x: b.left - 30, y: b.top - 20, width: b.width + 60, height: b.height + 40 }; });
await p.screenshot({ path: "qa/polish/s7-shelf.png", clip: r }); await b.close();
