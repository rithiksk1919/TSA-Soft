// Puts two PNGs side by side, magnified, to compare edges. usage: node qa/probes/side.mjs a.png b.png out.png [scale]
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
const [a, c, out, k = 3] = process.argv.slice(2);
const u = f => "data:image/png;base64," + readFileSync(f).toString("base64");
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent(`<body style="margin:0;display:flex;gap:8px;background:#f0f"><img src="${u(a)}" style="zoom:${k};image-rendering:pixelated"><img src="${u(c)}" style="zoom:${k};image-rendering:pixelated"></body>`);
await p.waitForTimeout(200); await p.screenshot({ path: out, fullPage: true }); await b.close();
