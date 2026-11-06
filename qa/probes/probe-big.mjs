// Reproduce the user's view: practice in the room, the fan, the book pull. usage: node probe-big.mjs W H tag
import { chromium } from "@playwright/test";
const [W = 2560, H = 1300, tag = "big"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: +H } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(m.text()));
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
const shot = (n) => p.screenshot({ path: `qa/traces/${tag}-${n}.png` });
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2200); await shot("1-practice");
await p.click('.dslot[data-id="flashcards"] .drawer'); await p.waitForTimeout(2600); await shot("2-fan");
await p.keyboard.press("Escape"); await p.waitForTimeout(2600);
await p.keyboard.press("Escape"); await p.waitForTimeout(2000);
await p.click('.rnav__btn[data-station="learn"]'); await p.waitForTimeout(2000); await shot("3-learn");
await p.click('.rbooks__btn[data-book="physics"]'); await p.waitForTimeout(300); await shot("4-pull");
await p.waitForTimeout(700); await shot("5-opening"); await p.waitForTimeout(1800); await shot("6-open");
console.log("errors", JSON.stringify(errs)); await b.close();
