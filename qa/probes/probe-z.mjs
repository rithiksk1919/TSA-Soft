import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.click("#to-cabinet"); await p.waitForTimeout(1800);
await p.click('.dslot[data-i="0"] .drawer'); await p.waitForTimeout(2600);
const zs = p.evaluate(() => new Promise((res) => { const s = document.querySelector('.dslot[data-i="0"]'); const out = []; const t0 = performance.now();
  (function f() { const m = s.style.transform.match(/,\s*([-\d.]+)px\)/); out.push([Math.round(performance.now() - t0), m ? +m[1] : null,
    document.elementFromPoint(...(() => { const r = s.querySelector('.drawer').getBoundingClientRect(); return [r.left + r.width * .15, r.top + r.height * .9]; })())?.className]);
    if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(out); })(); }));
await p.keyboard.press("Escape");
const out = await zs;
const neg = out.filter((x) => x[1] < 1);
console.log("min z", Math.min(...out.map((x) => x[1])), "frames below 1:", neg.length, neg.slice(0, 3), neg.slice(-2));
console.log("hits while below 1:", [...new Set(neg.map((x) => x[2]))]);
await b.close();
