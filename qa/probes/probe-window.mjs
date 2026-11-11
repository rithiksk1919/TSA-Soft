import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
const r = await p.evaluate(() => { const b = document.querySelector(".window__glass").getBoundingClientRect(); return { x: b.left - 40, y: b.top - 30, width: b.width + 80, height: b.height + 60 }; });
await p.screenshot({ path: "qa/polish/s5-window.png", clip: r }); await b.close();
