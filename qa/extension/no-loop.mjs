// The hub's "Your mistakes" panel must not be recorded by the extension (it would feed itself).
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "sb-ext-")), {
  channel: "chromium", headless: true, viewport: { width: 1600, height: 900 },
  args: ["--disable-extensions-except=" + ext, "--load-extension=" + ext]
});
const saved = [];
await ctx.route("**/api/action-log", async (r) => {
  const body = JSON.parse(r.request().postData() || "{}");
  saved.push(...(body.events || []));
  await r.fulfill({ contentType: "application/json", body: JSON.stringify({ saved: (body.events || []).length }) });
});
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:8000/");
await page.waitForSelector(".mk");
await page.click('.mistakes .seg button[data-scope="all"]');
await page.waitForTimeout(16000);
const panel = saved.filter((e) => e.type === "ui" && /Wrong answer|Marked wrong|mistakes/.test(e.summary));
console.log("actions saved:", saved.length, "| panel messages recorded:", panel.length);
await ctx.close();
