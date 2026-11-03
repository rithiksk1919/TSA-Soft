import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
await p.click('.dslot[data-i="0"] .drawer'); await p.waitForTimeout(3000);
console.log(await p.evaluate(() => new Promise((res) => {
  const n = document.querySelectorAll("#dcontents .fdivider")[1]; const out = [];
  let k = 0; (function f() { const r = n.getBoundingClientRect(); out.push([r.x.toFixed(2), r.y.toFixed(2), r.width.toFixed(2)].join(",")); if (++k < 6) requestAnimationFrame(f); else res({ rects: out, springs: window.SkillBridge.activeSprings(), hit: (() => { const c = n.getBoundingClientRect(); const e = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2); return e && (e.className + " same=" + (e === n || n.contains(e))); })() }); })();
})));
await b.close();
