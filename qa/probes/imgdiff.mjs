// Pixel diff of two PNGs in the browser: prints differing pixel count. usage: node qa/probes/imgdiff.mjs a.png b.png
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const [a, c] = process.argv.slice(2).map(f => "data:image/png;base64," + readFileSync(f).toString("base64"));
const b = await chromium.launch(); const p = await b.newPage();
const n = await p.evaluate(async ([a, c]) => {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const [i1, i2] = [await load(a), await load(c)];
  const px = i => { const cv = new OffscreenCanvas(i.width, i.height); const x = cv.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, i.width, i.height).data; };
  const d1 = px(i1), d2 = px(i2); let diff = 0, max = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let k = 0; k < d1.length; k += 4) { const m = Math.max(Math.abs(d1[k] - d2[k]), Math.abs(d1[k + 1] - d2[k + 1]), Math.abs(d1[k + 2] - d2[k + 2])); if (m > 8) { diff++; const q = k / 4, x = q % i1.width, y = (q / i1.width) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } max = Math.max(max, m); }
  return { diff, max, box: [x0, y0, x1, y1] };
}, [a, c]);
console.log(JSON.stringify(n)); await b.close();
