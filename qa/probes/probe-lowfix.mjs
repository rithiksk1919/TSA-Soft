// Prints the review overlay's computed position/inset/z-index/background/opacity, the History panel's
// HTML length and month headers, and the saved boxes after load. usage: node qa/probes/probe-lowfix.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/#test-practice");
await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6 && window.SkillBridge.debug.scene() === 1); await p.waitForTimeout(1500);
const review = await p.evaluate(() => { const r = document.querySelector(".review"), s = document.querySelector(".review__scrim"); const pick = (e, k) => k.map(x => getComputedStyle(e)[x]).join(","); return pick(r, ["position", "top", "left", "right", "bottom", "zIndex"]) + " | " + pick(s, ["position", "top", "left", "right", "bottom", "backgroundColor", "opacity"]); });
await p.locator('.dslot[data-i="4"] .drawer').click(); await p.waitForTimeout(3000);
const hist = await p.evaluate(() => { const b = document.querySelector("#sheet .sheet__body"); return { len: b.innerHTML.replace(/ style="[^"]*"/g, "").length, months: [...b.querySelectorAll(".divider-row--month")].map(d => d.textContent) }; });
console.log(JSON.stringify({ review, hist }));
await b.close();
