import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2600);
const hit = (label) => p.evaluate((label) => {
  const w = document.getElementById("world").getBoundingClientRect();
  return label + " world " + Math.round(w.top) + "-" + Math.round(w.bottom) + " | " + ["diagnostic", "history", "learned"].map((id) => { const d = document.querySelector(`.dslot[data-id="${id}"] .drawer`); const r = d.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return id + ":" + (!!e && d.contains(e)); }).join(" ");
}, label);
console.log(await hit("as is"));
await p.evaluate(() => { document.getElementById("world").style.overflow = "visible"; });
console.log(await hit("world overflow visible"));
await b.close();
