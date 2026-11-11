// Probe: in-room Practice, Flashcards open, at several sizes. Screenshots plus card rects.
import { chromium } from "@playwright/test";
const sizes = (process.argv[2] || "1536x864,1360x860,1920x1080,2560x1300").split(",").map((s) => s.split("x").map(Number));
const b = await chromium.launch();
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:5180/");
  await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
  await p.waitForTimeout(800);
  await p.locator('.rnav__btn[data-station="practice"]').click();
  await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
  await p.waitForTimeout(1500);
  await p.locator('.dslot[data-id="flashcards"] .drawer').click();
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `qa/fan-${w}.png` });
  console.log("bar", await p.evaluate(() => { const b = document.getElementById("drawer-bar"); const r = b.getBoundingClientRect(); return [b.hidden, getComputedStyle(b).visibility, Math.round(r.top), Math.round(r.bottom), innerHeight].join(" "); }));
  const r = await p.evaluate(() => [...document.querySelectorAll("#dcontents .fcard:not(.fcard--filler), #dcontents .fdivider")].map((n) => n.getBoundingClientRect()).reduce((a, r) => ({ l: Math.min(a.l, r.left), r: Math.max(a.r, r.right), t: Math.min(a.t, r.top), b: Math.max(a.b, r.bottom) }), { l: 1e9, r: -1e9, t: 1e9, b: -1e9 }));
  console.log(w, h, JSON.stringify(r));
  if (process.argv[3]) { const d = await p.locator('.fdivider').first().boundingBox(); await p.mouse.click(d.x + d.width / 2, d.y + d.height / 2); await p.waitForTimeout(2000); await p.screenshot({ path: `qa/fan-${w}-sub.png` }); }
  await p.close();
}
await b.close();
