// Delays room.js and screenshots the page before it runs: the room shell (not the flat library) should show.
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.route("**/room.js", async r => { await new Promise(f => setTimeout(f, 1500)); r.continue(); });
p.goto("http://127.0.0.1:5180/index.html");
await p.waitForTimeout(700);
const early = await p.evaluate(() => ({ boot: document.documentElement.classList.contains("room-boot"), roomShown: getComputedStyle(document.getElementById("room")).display }));
await p.screenshot({ path: "qa/perf-boot-early.png" });
await p.waitForTimeout(2500);
const late = await p.evaluate(() => ({ boot: document.documentElement.classList.contains("room-boot"), hidden: document.getElementById("room").hidden }));
console.log(JSON.stringify({ early, late }));
await b.close();
