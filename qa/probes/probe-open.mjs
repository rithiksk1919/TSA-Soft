import { chromium } from "@playwright/test";
const [i = "3"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
await p.click(`.dslot[data-i="${i}"] .drawer`); await p.waitForTimeout(1300);
console.log(await p.evaluate((i) => { const r = document.querySelector(`.dslot[data-i="${i}"] .drawer`).getBoundingClientRect(); const x = r.left + r.width * 0.15, y = r.top + r.height * 0.9; const e = document.elementFromPoint(x, y); return { r: [r.left, r.top, r.width, r.height].map(Math.round), pt: [Math.round(x), Math.round(y)], hit: e && (e.className || e.tagName) }; }, i));
await p.screenshot({ path: "qa/traces/open-" + i + ".png" });
await b.close();
