import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.focus(".rnav__btn[data-station=learn]"); await p.waitForTimeout(900);
console.log(await p.evaluate(() => [...document.querySelectorAll(".station3--shelf .glow3--hot")].map(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return [cs.display, cs.opacity, Math.round(r.width), Math.round(r.height)].join(" "); })));
await p.screenshot({ path: "qa/polish/g2-learn.png" });
await b.close();
