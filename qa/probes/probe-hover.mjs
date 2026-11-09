import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
const rects = await p.evaluate(() => [...document.querySelectorAll(".plaque")].map(e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), st: e.closest("[data-station]").dataset.station }; }));
console.log(JSON.stringify(rects));
for (const r of rects) {
  await p.mouse.move(r.x, r.y); await p.waitForTimeout(450);
  const info = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return { cursor: getComputedStyle(e).cursor, hot: [...document.querySelectorAll(".station3.is-hot")].map(s => s.dataset.station) }; }, [r.x, r.y]);
  console.log(r.st, JSON.stringify(info));
  await p.screenshot({ path: `qa/polish/s6-hover-${r.st}.png` });
}
await b.close();
