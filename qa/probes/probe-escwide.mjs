// Probe: at 2560 wide, Escape out of Practice after opening and closing a drawer.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://127.0.0.1:5180/");
await p.waitForFunction(() => window.SkillBridge && window.SkillBridge.room);
await p.waitForTimeout(800);
await p.locator('.rnav__btn[data-station="practice"]').click();
await p.waitForFunction(() => window.SkillBridge.room.state() === "practice");
await p.waitForTimeout(1200);
const st = () => p.evaluate(() => ({ room: SkillBridge.room.state(), drawer: SkillBridge.debug.drawer(), review: SkillBridge.review.isOpen(), panel: SkillBridge.panel && SkillBridge.panel.isOpen(), desk: SkillBridge.desk.isOpen(), focus: document.activeElement && (document.activeElement.className || document.activeElement.tagName) }));
for (const id of ["flashcards", "index", "learned"]) {
  await p.locator(`.dslot[data-id="${id}"] .drawer`).click();
  await p.waitForTimeout(2000);
  console.log("open", JSON.stringify(await st()));
  await p.keyboard.press("Escape"); await p.waitForTimeout(2000);
  console.log("closed", JSON.stringify(await st()));
}
await p.keyboard.press("Escape"); for (let t = 0; t < 12; t++) { await p.waitForTimeout(1000); console.log(t, JSON.stringify(await p.evaluate(() => [SkillBridge.room.state(), SkillBridge.activeSprings && SkillBridge.activeSprings(), SkillBridge.debug.drawer(), document.getAnimations().filter(a => a.playState === "running").map(a => (a.effect.target && a.effect.target.className) + ":" + a.effect.getTiming().iterations)]))); }
console.log("after esc", JSON.stringify(await st()));
await b.close();
