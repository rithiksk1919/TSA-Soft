// Freeze-frame each drawer's signature motion: screenshots at rest-open and mid-motion.
import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
await p.evaluate(() => { const s = window.SkillBridge.store; ["phy-normal-1", "bio-mrna-2"].forEach((id) => { s.answer(id, true); s.answer(id, true); }); });
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
for (const [i, id] of [[1, "index"], [2, "worked"], [3, "diagnostic"], [4, "history"], [5, "learned"]]) {
  await p.click(`.dslot[data-i="${i}"] .drawer`);
  for (const t of [900, 1500]) { await p.waitForTimeout(t === 900 ? 900 : 600); await p.screenshot({ path: `qa/traces/int-${id}-${t}.png`, clip: { x: 160, y: 100, width: 1040, height: 640 } }); }
  await p.waitForTimeout(1500);
  await p.keyboard.press("Escape"); await p.waitForTimeout(2600);
}
console.log("errors:", JSON.stringify(errs));
await b.close();
