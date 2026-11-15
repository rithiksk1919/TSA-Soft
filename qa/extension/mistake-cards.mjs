// A mistake you add becomes practice cards in the card catalog. Adds a test mistake to <subject>,
// practises it from the book, opens the card catalog, then deletes the test mistake.
// usage: node qa/extension/mistake-cards.mjs chem
import { chromium } from "playwright";
const sid = process.argv[2] || "chem";
const B = "http://127.0.0.1:8000";
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B + "/library/#book-my-" + sid);
await p.waitForSelector(".toc", { timeout: 20000 });
await p.waitForTimeout(1000);
await p.click('[data-open="mistakes"]');
await p.click('[data-mk="new"]');
await p.fill('textarea[name="question"]', "How many valence electrons does oxygen have?");
await p.fill('input[name="your_answer"]', "8");
await p.click('.mk-form [type="submit"]');
await p.waitForSelector('.mm--mine [data-mk="practise"]', { timeout: 60000 });
await p.waitForTimeout(400);
await p.screenshot({ path: "qa/extension/mc-1-book.png" });
const cards = await (await fetch(B + "/library/data/cards.json")).json();
const mine = cards.mistakes.filter((m) => m.id.startsWith("u-" + sid));
console.log("in cards.json:", mine.map((m) => m.call + " " + m.title + " (" + m.cards.length + " cards)").join("; "));
console.log("card 1:", JSON.stringify(mine[0].cards[0]).slice(0, 300));
await p.click('.mm--mine [data-mk="practise"]');
await p.waitForTimeout(3500);
await p.screenshot({ path: "qa/extension/mc-2-review.png" });
await p.keyboard.press("1");
await p.waitForTimeout(700);
await p.screenshot({ path: "qa/extension/mc-3-answered.png" });
await p.keyboard.press("Escape");
await p.waitForTimeout(1200);
await p.goto(B + "/library/#practice");
await p.waitForTimeout(4000);
await p.screenshot({ path: "qa/extension/mc-4-catalog.png" });
for (const m of mine) await fetch(B + "/api/my-subjects/" + sid + "/mistakes/" + m.id.split("-").pop(), { method: "DELETE" });
console.log("left:", (await (await fetch(B + "/library/data/cards.json")).json()).mistakes.filter((m) => m.id.startsWith("u-")).length, "|", errs.join("; ") || "no page errors");
await b.close();
