// Probe: replay room.spec's wide Practice test and report what keeps the page from settling at the end.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
const quiet = () => p.evaluate(() => {
  const sb = window.SkillBridge;
  const an = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations !== Infinity);
  return { springs: sb.activeSprings(), drawer: sb.debug.drawer(), room: sb.room.state(), anims: an.map((a) => (a.constructor.name) + " " + (a.transitionProperty || a.animationName || "") + " @" + ((a.effect.target && a.effect.target.className) || "?").toString().slice(0, 60)) };
});
async function settle() { for (let t = 0; t < 40; t++) { const q = await quiet(); if (!q.springs && !q.anims.length && q.drawer !== "opening" && q.drawer !== "closing") return; await p.waitForTimeout(250); } console.log("NOT SETTLED", JSON.stringify(await quiet())); }
await settle();
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice"); await settle();
for (const id of ["flashcards", "index", "worked", "diagnostic", "history", "learned"]) {
  await p.locator(`.dslot[data-id="${id}"] .drawer`).click(); await settle();
  if (id === "flashcards") { const bx = await p.locator("#dcontents .fdivider").first().boundingBox(); await p.mouse.click(bx.x + bx.width / 2, bx.y + bx.height * 0.6); await settle(); console.log("subject?", await p.evaluate(() => SkillBridge.debug.drawer())); }
  for (let k = 0; k < 3 && (await p.evaluate(() => SkillBridge.debug.drawer())) !== "closed"; k++) { await p.keyboard.press("Escape"); await settle(); }
  console.log(id, JSON.stringify(await quiet()));
}
await p.keyboard.press("Escape");
await p.waitForFunction(() => window.SkillBridge.room.state() === "overview", null, { timeout: 8000 }).catch(() => console.log("never overview"));
await settle();
console.log("end", JSON.stringify(await quiet()));
await b.close();
