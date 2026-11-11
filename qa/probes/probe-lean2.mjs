import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 4 });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1000);
await p.screenshot({ path: "qa/polish/lean-zoom.png", clip: { x: 370, y: 340, width: 100, height: 120 } });
await b.close();
