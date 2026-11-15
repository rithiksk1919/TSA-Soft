// Loads extension/ unpacked, uses SkillBridge, then opens the side panel page for that tab and
// checks the log. usage: node qa/extension/test.mjs   (app running on port 8000)
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sb-ext-"));
const ctx = await chromium.launchPersistentContext(dir, {
  channel: "chromium", headless: true, viewport: { width: 1400, height: 900 },
  args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext]
});
// Saves go to this test, never to the real log in data/action-log/.
const saved = [];
await ctx.route("**/api/action-log", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  saved.push(...(body.events || []));
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ saved: (body.events || []).length }) });
});

let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const errs = [];
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push("page: " + e.message));
await page.goto("http://127.0.0.1:8000/");
await page.waitForSelector(".school .room");
await page.waitForTimeout(600);
await page.hover('.room[data-room="gym"]');
await page.keyboard.press("Tab");
await page.click('.room[data-room="classroom"]');
await page.waitForTimeout(2500);
await page.keyboard.press("Escape");
await page.goBack();
await page.waitForTimeout(1200);
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://127.0.0.1/*" }))[0].id);
const panel = await ctx.newPage();
panel.on("pageerror", (e) => errs.push("panel: " + e.message));
await panel.setViewportSize({ width: 420, height: 900 });
await panel.goto(`chrome-extension://${id}/panel.html?tab=${tabId}`);
await panel.waitForTimeout(800);
const n1 = await panel.locator(".log li").count();
console.log("status:", await panel.locator("#status").textContent(), "| rows:", n1);
console.log((await panel.locator(".log li .sum").allTextContents()).slice(0, 18).reverse().join("\n"));
await panel.screenshot({ path: "qa/extension/panel-1.png" });
// live: a new action appears without reloading the panel
await page.bringToFront();
await page.click("#why-this").catch(() => errs.push("no Why this? button"));
await page.waitForTimeout(800);
console.log("live rows after a click:", await panel.locator(".log li").count(), "(was", n1 + ")");
await panel.locator(".log li .row").first().click();
await panel.locator(".chip", { hasText: "Focus" }).click();
await panel.locator(".chip", { hasText: "Hover" }).click();
await panel.screenshot({ path: "qa/extension/panel-2.png" });
await panel.locator("#search").fill("api/");
await panel.waitForTimeout(300);
console.log("rows matching 'api/':", await panel.locator(".log li").count());
await panel.locator(".log li .row").nth(1).click();
await panel.screenshot({ path: "qa/extension/panel-3.png" });
await panel.emulateMedia({ colorScheme: "dark" });
await panel.locator("#search").fill("");
await panel.waitForTimeout(300);
await panel.screenshot({ path: "qa/extension/panel-dark.png" });
console.log(errs.join("\n") || "no errors");
await ctx.close();
