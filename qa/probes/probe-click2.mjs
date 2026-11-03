import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.evaluate(() => {
  window.__ev = [];
  ["pointerdown", "pointerup", "click"].forEach((t) => document.addEventListener(t, (e) => window.__ev.push(t + ":" + (e.target.className || e.target.tagName) + ":inRow=" + !!e.target.closest("#shelf-row") + ":detail=" + e.detail), true));
});
await p.click('.book[data-id="physics"]'); await p.waitForTimeout(200);
console.log(await p.evaluate(() => window.__ev));
console.log(await p.evaluate(() => ({ bookOpen: window.SkillBridge.bookOpen(), cur: document.getElementById("reader").className })));
await b.close();
