// The extension on a school site that is not SkillBridge: a fake course store served by
// Playwright (no network), with a sign-in and a card payment.
// Checks that actions are recorded, secrets are hidden, binary bodies are skipped, frames are marked.
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ext-"));
const ctx = await chromium.launchPersistentContext(dir, {
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

await ctx.route("http://shop.test/**", (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === "/api/cart") return route.fulfill({ contentType: "application/json", body: JSON.stringify({ items: 2, total: 19.5 }) });
  if (u.pathname === "/logo.png") return route.fulfill({ contentType: "image/png", body: Buffer.alloc(5000) });
  if (u.pathname === "/frame") return route.fulfill({ contentType: "text/html", body: "<button id=f>Play video</button>" });
  return route.fulfill({ contentType: "text/html", body: `<!doctype html><title>Course store: algebra homework help</title>
    <h1>Algebra course: lesson videos, practice quizzes and homework help for students</h1><label>Email <input id=email name=email></label>
    <label>Password <input id=pw type=password name=password></label>
    <label>Card <input id=card name=cardnumber autocomplete=cc-number></label>
    <button id=buy>Buy now</button><div role=status id=msg></div>
    <iframe src="/frame" width=300 height=80></iframe>
    <script>document.getElementById("buy").onclick = async () => {
      const r = await fetch("/api/cart", { method: "POST", body: JSON.stringify({ sku: "A1" }) });
      await fetch("/logo.png");
      document.getElementById("msg").textContent = "Added to cart: " + (await r.json()).items + " items";
    };</script>` });
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto("http://shop.test/");
await page.fill("#email", "sam@example.com");
await page.fill("#pw", "hunter2-secret");
await page.fill("#card", "4111111111111111");
await page.click("#buy");
await page.frameLocator("iframe").locator("#f").click();
await page.waitForTimeout(1200);
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://shop.test/*" }))[0].id);
const panel = await ctx.newPage();
const errs = [];
panel.on("pageerror", (e) => errs.push(e.message));
await panel.setViewportSize({ width: 440, height: 900 });
await panel.goto(`chrome-extension://${id}/panel.html?tab=${tabId}`);
await panel.waitForTimeout(800);
const rows = await panel.locator(".log li .sum").allTextContents();
console.log(rows.slice().reverse().join("\n"));
const all = JSON.stringify(await sw.evaluate(async (t) => (await chrome.storage.session.get("logs")).logs[t], tabId));
console.log("\npassword leaked:", all.includes("hunter2"), "| card leaked:", all.includes("4111111111111111"), "| email recorded:", all.includes("sam@example.com"));
await panel.screenshot({ path: "qa/extension/any-site.png" });
await panel.click("#frames");
console.log("rows with frames hidden:", await panel.locator(".log li").count(), "of", rows.length);
console.log(errs.join("\n") || "no panel errors");
await ctx.close();
