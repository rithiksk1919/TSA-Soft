import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(800);
console.log((await p.evaluate(() => [...document.querySelectorAll(".station3--shelf .book3")].map(e => {
  const m = e.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, ([-\d.]+)px\)(.*)/); const f = e.querySelector(".f3--front");
  return [+m[1], +m[2], +m[3], f ? f.style.width : "-", f ? f.style.height : "-", m[4].trim()];
}).filter(r => r[1] > -420 && r[1] < -240).sort((a, b) => a[0] - b[0]))).map(r => r.join("  ")).join("\n"));
await b.close();
