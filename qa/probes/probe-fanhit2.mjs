import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
await p.waitForTimeout(1500);
await p.locator('.dslot[data-id="flashcards"] .drawer').click();
await p.waitForTimeout(2600);
console.log(await p.evaluate(() => [...document.querySelectorAll(".fdivider")].map((d) => {
  const r = d.getBoundingClientRect(); const out = [];
  for (const fy of [0.2, 0.4, 0.6, 0.8]) { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * fy); out.push(fy + ":" + (e ? e.className.slice(0, 30) : "-")); }
  return JSON.stringify({ r: [r.left, r.top, r.width, r.height].map(Math.round), out });
}).join("\n")));
await p.screenshot({ path: "qa/fan-2560.png" });
await b.close();
