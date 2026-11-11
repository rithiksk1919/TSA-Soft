import { chromium } from "@playwright/test";
const b = await chromium.launch(); const errs = [];
for (const [w, h] of [[1440, 900], [390, 844], [1024, 768], [1360, 860], [1920, 1080], [2560, 1440], [820, 1180], [1280, 640]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1000);
  const r = await p.evaluate(() => {
    const box = (e) => e.getBoundingClientRect();
    let hb = 0; document.querySelectorAll(".room__head > *").forEach(e => hb = Math.max(hb, box(e).bottom));
    const nav = box(document.querySelector(".rnav"));
    const items = [...document.querySelectorAll(".plaque, .pendant .f3--bottom, .globe__disc")].map(e => ({ n: e.className.split(" ")[1] || e.className, r: box(e) }));
    const bad = items.filter(i => i.r.top < hb || i.r.left < 0 || i.r.right > innerWidth || (i.r.bottom > nav.top && i.r.right > nav.left && i.r.left < nav.right)).map(i => i.n + "@" + Math.round(i.r.top));
    const pw = [...document.querySelectorAll(".plaque")].map(e => Math.round(box(e).width));
    return { hb: Math.round(hb), signW: pw, bad };
  });
  console.log(w + "x" + h, JSON.stringify(r));
  await p.screenshot({ path: `qa/polish/vp-${w}x${h}.png` });
  await p.close();
}
console.log("errors", JSON.stringify(errs)); await b.close();
