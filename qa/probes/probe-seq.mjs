import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
await p.click('.dslot[data-id="flashcards"] .drawer'); await p.waitForTimeout(3000);
await p.keyboard.press("Escape"); await p.waitForTimeout(80);
await p.click('.dslot[data-id="learned"] .drawer', { force: true });
await p.waitForTimeout(3500);
console.log(await p.evaluate(() => ({ st: window.SkillBridge.debug.drawer(), id: window.SkillBridge.debug.drawerId(), panel: window.SkillBridge.debug.panel() })));
console.log(await p.evaluate(() => {
  const b = document.querySelector('.dslot[data-id="learned"] .drawer'); const r = b.getBoundingClientRect();
  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { state: window.SkillBridge.debug.drawer(), hit: e && (e.className || e.tagName), inside: !!e && b.contains(e), inert: !!b.closest("[inert]") };
}));
await b.close();
