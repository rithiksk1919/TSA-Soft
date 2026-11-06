import { chromium } from "@playwright/test";
const b = await chromium.launch(); const errs = [];
for (const [w, h] of [[1360, 860], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
  await p.screenshot({ path: `qa/screens/00-room-${w}.png` });
  await p.click('.station[data-scene="practice"]'); await p.waitForTimeout(260);
  await p.screenshot({ path: `qa/traces/room-zoom-${w}.png` }); await p.waitForTimeout(1500);
  console.log(w, await p.evaluate(() => ({ room: document.getElementById("room").hidden, scene: window.SkillBridge.debug.scene(), hash: location.hash, focus: document.activeElement.id })));
  await p.click("#to-room"); await p.waitForTimeout(1600);
  console.log(w, "back", await p.evaluate(() => ({ room: document.getElementById("room").hidden, focus: document.activeElement.className })));
}
console.log("errors", JSON.stringify(errs)); await b.close();
