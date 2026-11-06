// Overview, practice, fan at a given size.
import { chromium } from "@playwright/test";
const [W = 2560, H = 1300, tag = "v"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +W, height: +H } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && errs.push(m.text()));
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.screenshot({ path: `qa/traces/${tag}-0-overview.png` });
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2300); await p.screenshot({ path: `qa/traces/${tag}-1-practice.png` });
await p.click('.dslot[data-id="flashcards"] .drawer'); await p.waitForTimeout(2800); await p.screenshot({ path: `qa/traces/${tag}-2-fan.png` });
console.log(W, "errors", JSON.stringify(errs)); await b.close();
