import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station=apply]'); await p.waitForTimeout(4000);
console.log(await p.evaluate(() => ({ lib: document.getElementById("library").inert, room: document.getElementById("room").inert, desk: document.getElementById("desk").inert, toRoomDisp: getComputedStyle(document.getElementById("to-room")).display, toRoomHidden: document.getElementById("to-room").hidden })));
// tab through and record focus
const seen = []; for (let i = 0; i < 40; i++) { await p.keyboard.press("Tab"); seen.push(await p.evaluate(() => { const e = document.activeElement; return (e.id || e.className || e.tagName) + "|" + (e.closest("#desk") ? "desk" : "OUT"); })); }
console.log(seen.filter(s => s.endsWith("OUT")));
await b.close();
