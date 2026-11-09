// Probe: at the Practice station, what paints the strip just under the catalog's top.
import { chromium } from "@playwright/test";
const out = process.argv[2] || "qa";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1536, height: 864 } });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/ct-top.png`, clip: { x: 380, y: 360, width: 800, height: 120 } });
console.log(await p.evaluate(() => {
  const r = (s) => { const n = document.querySelector(s); if (!n) return s + " none"; const b = n.getBoundingClientRect(); return s + " " + [b.left, b.top, b.right, b.bottom].map(Math.round).join(","); };
  return [r("#cab-front"), r(".station3--catalog .cat-body .f3--front"), r(".station3--catalog .cat-top .f3--front"), r(".cab__side--l"), r(".cab__side--r")].join("\n");
}));
await b.close();
