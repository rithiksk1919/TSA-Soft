// Probe: Practice in the room is one cabinet. Shots at arrival, Flashcards open, Mistakes index open.
import { chromium } from "@playwright/test";
const out = process.argv[2] || "qa";
const [w, h] = (process.argv[3] || "1536x864").split("x").map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/one-${w}-0.png` });
for (const id of ["flashcards", "index"]) {
  const d = await p.locator(`.dslot[data-id="${id}"] .drawer`).boundingBox();
  if (!d) { console.log("no drawer", id); continue; }
  await p.mouse.click(d.x + d.width / 2, d.y + d.height * 0.6);
  await p.waitForTimeout(2400);
  await p.screenshot({ path: `${out}/one-${w}-${id}.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(1800);
}
console.log("errors:", errs.length ? errs.join(" | ") : "none");
await b.close();
