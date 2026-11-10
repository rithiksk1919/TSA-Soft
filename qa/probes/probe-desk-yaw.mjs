// Sweeps the mouse across the desk (many events per frame) and reports the camera yaw reached at
// the right edge, the left edge and after leaving, plus how many promises the yaw spring is holding.
// usage: node qa/probes/probe-desk-yaw.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/#desk"); await p.waitForTimeout(3000);
const yawNow = () => p.evaluate(() => { const m = /rotateY\((-?[\d.]+)deg\)/.exec(document.querySelector(".dk-cam").style.transform); return m ? +m[1] : null; });
const box = await p.locator(".dk-stage").boundingBox();
await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
await p.mouse.move(box.x + box.width * 0.98, box.y + box.height * 0.5, { steps: 120 });
await p.waitForTimeout(2500); const right = await yawNow();
await p.mouse.move(box.x + box.width * 0.02, box.y + box.height * 0.5, { steps: 120 });
await p.waitForTimeout(2500); const left = await yawNow();
await p.mouse.move(2, 2); await p.waitForTimeout(2500); const out = await yawNow();
console.log(JSON.stringify({ right, left, afterLeave: out }));
await b.close();
