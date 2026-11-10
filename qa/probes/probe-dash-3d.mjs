// Deterministic shots of the dashboard's 3D pieces: shelf books (rest, each hovered), drawers (hovered),
// diorama (rest and pointer at each corner). Saves qa/poses/dash-<tag>-<n>.png. usage: node qa/probes/probe-dash-3d.mjs <tag>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const tag = process.argv[2] || "now"; mkdirSync("qa/poses", { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/dashboard.html"); await p.waitForSelector("html.is-ready");
await p.addStyleTag({ content: "*{transition:none!important}" }); await p.waitForTimeout(400);
const shelf = await p.$(".hello__shelf"), due = await p.$(".due"), prev = await p.$(".preview");
await p.mouse.move(5, 5); await shelf.screenshot({ path: `qa/poses/dash-${tag}-books.png` });
for (const i of [1, 2, 3]) { await p.hover(`.book3d:nth-child(${i}) .book3d__link`); await p.waitForTimeout(150); await shelf.screenshot({ path: `qa/poses/dash-${tag}-book${i}.png` }); }
for (const i of [1, 2, 3]) { await p.hover(`.due__row:nth-child(${i}) .due__link`); await p.waitForTimeout(150); await due.screenshot({ path: `qa/poses/dash-${tag}-drawer${i}.png` }); }
await p.mouse.move(5, 5); await prev.scrollIntoViewIfNeeded(); await p.waitForTimeout(150); await prev.screenshot({ path: `qa/poses/dash-${tag}-dio.png` });
const r = await prev.boundingBox();
for (const [fx, fy, n] of [[0.02, 0.02, "tl"], [0.98, 0.02, "tr"], [0.02, 0.98, "bl"], [0.98, 0.98, "br"]]) {
  await p.mouse.move(r.x + r.width * fx, r.y + r.height * fy); await p.waitForTimeout(250);
  await prev.screenshot({ path: `qa/poses/dash-${tag}-dio-${n}.png` });
}
console.log(tag, "faces", await p.evaluate(() => document.querySelectorAll(".cube .f").length));
await b.close();
