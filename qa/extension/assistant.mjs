// The school check on an AI assistant page (a stand-in for chatgpt.com, served by Playwright, no
// network): small talk must stay unrecorded; asking a maths question must start recording, and
// the question typed just before must be kept.
import { chromium } from "playwright";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
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

await ctx.route("https://chatgpt.com/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><title>ChatGPT</title>
  <nav>${["Weekend plans", "Pizza places near me", "Gift ideas for mom", "Movie night", "Workout split", "Trip packing list"].map((t) => "<a href=#>" + t + "</a>").join("")}</nav>
  <main><div id=thread></div><div id=box contenteditable=true style="border:1px solid #999;min-height:40px"></div></main>
  <script>
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const q = box.innerText; box.innerText = "";
      thread.insertAdjacentHTML("beforeend", "<p class=user>" + q + "</p>");
      setTimeout(() => {
        const math = /solve|=/.test(q);
        thread.insertAdjacentHTML("beforeend", math
          ? "<div class=answer>Subtract 3 from both sides: <span class=katex>2x = 8</span>, then divide by 2: <span class=katex>x = 4</span>.</div>"
          : "<div class=answer>Tony's on Main Street has great reviews and is open late.</div>");
      }, 300);
    });
  </script>` }));
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent("serviceworker");
const id = new URL(sw.url()).host;
const page = await ctx.newPage();
await page.goto("https://chatgpt.com/c/test");
const tab = await sw.evaluate(async () => (await chrome.tabs.query({ url: "https://chatgpt.com/*" }))[0].id);
const panel = await ctx.newPage();
await panel.setViewportSize({ width: 420, height: 760 });
async function look(label) {
  await panel.goto(`chrome-extension://${id}/panel.html?tab=${tab}`);
  await panel.waitForTimeout(500);
  console.log(label.padEnd(14), "|", (await panel.locator("#gate").textContent()).trim(), "| rows:", await panel.locator(".log li").count());
}
await page.bringToFront();
await page.click("#box");
await page.keyboard.type("any good pizza places open late tonight?");
await page.keyboard.press("Enter");
await page.waitForTimeout(6500);
await look("small talk");
await page.bringToFront();
await page.click("#box");
await page.keyboard.type("how do I solve 2x + 3 = 11 step by step");
await page.keyboard.press("Enter");
await page.waitForTimeout(1500);
await look("maths question");
console.log((await panel.locator(".log li .sum").allTextContents()).reverse().join("\n"));
await panel.screenshot({ path: "qa/extension/assistant.png" });
await ctx.close();
