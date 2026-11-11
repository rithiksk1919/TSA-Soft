// usage: node qa/probes/shot-polish.mjs <tag>   -> qa/polish/<tag>-1440.png, <tag>-390.png (+ hover shots)
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "now";
const b = await chromium.launch(); const errs = [];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
  await p.mouse.move(w / 2, h / 2); await p.waitForTimeout(50);
  await p.screenshot({ path: `qa/polish/${tag}-${w}.png` });
  // Plaque boxes vs viewport and the header box
  const info = await p.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
    return { head: r(document.querySelector(".room__head")), plaques: [...document.querySelectorAll(".plaque")].map(r), nav: r(document.querySelector(".rnav")) };
  });
  console.log(w, JSON.stringify(info));
  if (process.argv[3] === "hover" && w > 800) {
    await p.hover(".rnav__btn[data-station=apply]"); await p.waitForTimeout(400);
    await p.screenshot({ path: `qa/polish/${tag}-hover-${w}.png` });
  }
  await p.close();
  if (w > 800) {   // a 2x close-up of the reading desk, to check what rests on it
    const z = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await z.goto("http://127.0.0.1:5180/"); await z.waitForTimeout(1200);
    const r = await z.evaluate(() => { const b = document.querySelector(".station3--desk .wood--warm .f3--top").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
    await z.screenshot({ path: `qa/polish/${tag}-desk.png`, clip: { x: r.x - 60, y: r.y - 190, width: r.w + 120, height: r.h + 280 } });
    await z.close();
  }
}
console.log("errors", JSON.stringify(errs)); await b.close();
