import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2000);
const hit = (label) => p.evaluate((label) => {
  const d = document.querySelector('.dslot[data-id="index"] .drawer'); const r = d.getBoundingClientRect();
  const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return label + ": " + (e && (e.id || e.className)) + " ok=" + (!!e && d.contains(e));
}, label);
console.log(await hit("as is"));
await p.evaluate(() => { document.getElementById("library").style.zIndex = "auto"; document.getElementById("library").style.position = "static"; document.getElementById("room").style.display = "none"; });
console.log(await hit("library unpositioned, room gone"));
await p.evaluate(() => { document.getElementById("library").style.zIndex = ""; document.getElementById("library").style.position = ""; });
console.log(await hit("library positioned, room gone"));
await p.evaluate(() => { window.SkillBridge.cabOverlay = null; window.SkillBridge.renderCabinet(); });
console.log(await hit("no overlay transform"));
await b.close();
