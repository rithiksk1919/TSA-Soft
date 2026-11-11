import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2600);
for (const id of ["flashcards", "index", "worked", "diagnostic", "history", "learned"]) {
  const info = await p.evaluate((id) => { const d = document.querySelector(`.dslot[data-id="${id}"] .drawer`); const r = d.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height].map(Math.round), hit: e && (e.id || e.className), ok: !!e && d.contains(e), st: window.SkillBridge.debug.drawer() }; }, id);
  console.log(id, JSON.stringify(info));
  if (!info.ok) { await p.screenshot({ path: "qa/traces/wide-block.png" }); break; }
  await p.click(`.dslot[data-id="${id}"] .drawer`); await p.waitForTimeout(3000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(3200);
}
await b.close();
