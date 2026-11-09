// Probe: filmstrip of flying into Practice (room catalog -> working cabinet).
import { chromium } from "@playwright/test";
const out = process.argv[2] || "qa";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1536, height: 864 } });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
for (let i = 0; i < 8; i++) { await p.waitForTimeout(i < 6 ? 180 : 500); await p.screenshot({ path: `${out}/cz-${i}.png` }); }
await b.close();
