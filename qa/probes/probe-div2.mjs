import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
await p.click('.dslot[data-i="0"] .drawer'); await p.waitForTimeout(3000);
for (const s of ["physics", "chemistry", "biology", ""]) { await p.click(`#subject-buttons .chip-btn[data-subject="${s}"]`); await p.waitForTimeout(1800); }
console.log(await p.evaluate(() => {
  const n = document.querySelectorAll("#dcontents .fdivider")[1]; const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
  const c = r; const hit = document.elementFromPoint(c.x + c.width / 2, c.y + c.height / 2);
  return { checkVis: n.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }), hit: hit && hit.className, state: window.SkillBridge.debug.drawer(), rect: [r.x, r.y, r.width, r.height].map(Math.round), vis: cs.visibility, disabled: n.disabled, transform: n.style.transform, inertUp: !!n.closest("[inert]") };
}));
await b.close();
