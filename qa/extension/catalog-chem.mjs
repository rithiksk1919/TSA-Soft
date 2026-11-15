// The card catalog's Flashcards drawer with a mistake you added (test mistake removed afterwards).
import { chromium } from "playwright";
const sid = process.argv[2] || "chem";
const B = "http://127.0.0.1:8000";
const add = await (await fetch(B + "/api/my-subjects/" + sid + "/mistakes", { method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "How many valence electrons does oxygen have?", your_answer: "8" }) })).json();
await fetch(B + "/api/my-subjects/" + sid + "/mistakes/" + add.id + "/explain", { method: "POST" });
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B + "/library/");
await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="practice"]');
await p.waitForTimeout(2500);
await p.screenshot({ path: "qa/extension/cat-1-practice.png" });
const drawer = p.locator(".drawer").first();
await drawer.click();
await p.waitForTimeout(2500);
await p.screenshot({ path: "qa/extension/cat-2-flashcards.png" });
const chip = p.locator('.chip-btn[data-subject="my-' + sid + '"]');
console.log("Chem chip in the drawer:", await chip.count());
if (await chip.count()) { await chip.first().click(); await p.waitForTimeout(800); await p.screenshot({ path: "qa/extension/cat-3-chem.png" }); }
await fetch(B + "/api/my-subjects/" + sid + "/mistakes/" + add.id, { method: "DELETE" });
console.log(errs.join("; ") || "no page errors");
await b.close();
