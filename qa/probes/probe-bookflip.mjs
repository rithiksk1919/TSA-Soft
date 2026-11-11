import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="learn"]'); await p.waitForTimeout(2000);
await p.click('.rbooks__btn[data-book="physics"]');
for (const t of [120, 260, 420, 600, 900, 1500, 2600]) { await p.waitForTimeout(t === 120 ? 120 : 160); await p.screenshot({ path: `qa/traces/flip-${String(t).padStart(4, "0")}.png` }); }
await p.keyboard.press("Escape");
for (const t of [200, 700, 1200, 1700]) { await p.waitForTimeout(250); await p.screenshot({ path: `qa/traces/flipc-${t}.png` }); }
await b.close();
