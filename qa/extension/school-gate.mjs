// The school check and saving: a shop page must not be recorded, a homework page and SkillBridge
// must be, and recorded actions must reach data/action-log/ through the SkillBridge server.
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
const logDir = path.resolve("data/action-log");
const started = Date.now();
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sb-ext-")), {
  channel: "chromium", headless: true, viewport: { width: 1200, height: 800 },
  args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext]
});
// Saves go to this test, never to the real log in data/action-log/.
const saved = [];
await ctx.route("**/api/action-log", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  saved.push(...(body.events || []));
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ saved: (body.events || []).length }) });
});

await ctx.route("http://shop.test/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>Sneaker deals</title><h1>New sneakers</h1><p>Free shipping on orders over $50. Add to cart.</p><button id=b>Add to cart</button>" }));
await ctx.route("http://homework.test/**", (r) => {
  if (r.request().url().endsWith("/check")) return r.fulfill({ contentType: "application/json", body: JSON.stringify({ correct: false, question: "Solve 2x + 3 = 11", expected: "x = 4", explanation: "Subtract 3 first, then divide by 2." }) });
  return r.fulfill({ contentType: "text/html", body: `<title>Algebra homework: Lesson 3 quiz</title><h1>Lesson 3: linear equations</h1>
    <p>Practice problem 1. Solve the equation for x.</p><label>Answer <input id=a></label><button id=go>Check</button><div role=status id=msg></div>
    <script>go.onclick = async () => { const r = await (await fetch("/check", { method: "POST", body: JSON.stringify({ answer: a.value }) })).json();
      msg.textContent = r.correct ? "Correct!" : "Not quite. Try again."; };</script>` });
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto("http://shop.test/");
await page.click("#b");
await page.waitForTimeout(600);
const shopTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://shop.test/*" }))[0].id);
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 440, height: 760 });
await panel.goto(`chrome-extension://${id}/panel.html?tab=${shopTab}`);
await panel.waitForTimeout(600);
console.log("SHOP  gate:", await panel.locator("#gate").textContent(), "| rows:", await panel.locator(".log li").count());
await panel.screenshot({ path: "qa/extension/gate-shop.png" });

// searches are judged by what was searched for
await ctx.route("https://www.google.com/search**", (r) => r.fulfill({ contentType: "text/html", body: "<title>Results</title><main><h3>History of Poland</h3><p>Learn about the university, school and college students, course and lesson history.</p></main>" }));
for (const q of ["poland time rn", "how to solve quadratic equations", "what's 12 x 3"]) {
  await page.bringToFront();
  await page.goto("https://www.google.com/search?q=" + encodeURIComponent(q));
  await page.waitForTimeout(400);
  const gTab = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://www.google.com/*" }))[0].id);
  await panel.goto(`chrome-extension://${id}/panel.html?tab=${gTab}`);
  await panel.waitForTimeout(400);
  console.log(("SEARCH " + q).padEnd(42), (await panel.locator("#gate").textContent()).trim());
}
await page.bringToFront();
await page.goto("http://homework.test/");
await page.fill("#a", "x = 7");
await page.click("#go");
await page.goto("http://127.0.0.1:8000/");
await page.waitForSelector(".school .room");
await page.click('.room[data-room="gym"]');
await page.waitForTimeout(6000);
await panel.goto(`chrome-extension://${id}/panel.html?tab=${shopTab}`);
await panel.waitForTimeout(800);
console.log("NOW   gate:", await panel.locator("#gate").textContent());
console.log("      rows:", await panel.locator(".log li").count(), "| footer:", await panel.locator("#sync").textContent());
await panel.screenshot({ path: "qa/extension/gate-school.png" });
await ctx.close();

// what the extension saved during this test
const mine = saved.map((e) => JSON.stringify(e));
console.log("saved during this test:", mine.length, "| any shop.test:", mine.some((l) => l.includes("shop.test")), "| poland search:", mine.some((l) => l.includes("poland")), "| homework.test:", mine.some((l) => l.includes("homework.test")), "| skillbridge:", mine.some((l) => l.includes("127.0.0.1:8000")));
