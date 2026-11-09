import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1536, height: 864 } });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
await p.waitForTimeout(1500);
await p.locator('.dslot[data-id="flashcards"] .drawer').click();
await p.waitForTimeout(2600);
console.log(await p.evaluate(() => [...document.querySelectorAll(".fdivider")].map((d) => {
  const r = d.getBoundingClientRect();
  const out = [];
  for (const fy of [0.2, 0.5, 0.8]) { const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * fy); out.push(fy + ":" + (e ? e.className + (e.dataset.mistake || "") : "-")); }
  return JSON.stringify({ r: [r.left, r.top, r.width, r.height].map(Math.round), out });
}).join("\n")));
await p.screenshot({ path: "qa/fan-zoom2.png", clip: { x: 430, y: 180, width: 680, height: 280 } });
console.log(await p.evaluate(() => { const o = [scrollX, scrollY]; document.querySelectorAll("*").forEach((n) => { if (n.scrollTop || n.scrollLeft) o.push(n.className + ":" + n.scrollLeft + "," + n.scrollTop); }); return JSON.stringify(o); }));
const s = await p.context().newCDPSession(p);
const { root } = await s.send("DOM.getDocument");
const { nodeIds } = await s.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: ".fdivider" });
for (const id of nodeIds) { const q = await s.send("DOM.getContentQuads", { nodeId: id }); console.log(JSON.stringify(q.quads.map((a) => a.map(Math.round)))); }
await b.close();
