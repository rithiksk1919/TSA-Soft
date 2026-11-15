// A quiz in an AI chat (a ChatGPT-like page served by Playwright, no network): the assistant's
// replies must be recorded once they finish, saved through SkillBridge, and scripts/mistakes.py
// must find the wrong answer.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
const ext = path.resolve("extension");
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

await ctx.route("https://chatgpt.com/**", (r) => r.fulfill({ contentType: "text/html", body: `<!doctype html><title>Ask Me 1 Plus 1</title>
  <main><div id=thread></div><div id=box contenteditable=true style="border:1px solid #999;min-height:40px"></div></main>
  <script>
    const replies = { "what's 2+2 ask me": "What is 2 + 2? 😏", "9": "💀 You're actually rewriting mathematics." };
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const q = box.innerText.trim(); box.innerText = "";
      thread.insertAdjacentHTML("beforeend", "<div data-message-author-role=user>" + q + "</div>");
      const full = replies[q] || "Okay.";
      const el = document.createElement("div"); el.dataset.messageAuthorRole = "assistant"; thread.appendChild(el);
      let i = 0; const t = setInterval(() => { el.textContent = full.slice(0, i += 3); if (i >= full.length) clearInterval(t); }, 80);
    });
  </script>` }));
const page = await ctx.newPage();
await page.goto("https://chatgpt.com/c/quiz");
for (const msg of ["what's 2+2 ask me", "9"]) {
  await page.click("#box");
  await page.keyboard.type(msg);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4500);
}
await page.waitForTimeout(5000);   // let the extension save
await ctx.close();
const day = new Date().toISOString().slice(0, 10);
const mine = saved.filter((e) => String(e.url).includes("chatgpt.com/c/quiz")).map((e) => JSON.stringify(e));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sb-quiz-"));
fs.writeFileSync(path.join(tmp, day + ".jsonl"), mine.join("\n") + "\n");
console.log("saved from this test:", mine.length, "| replies recorded:", mine.filter((l) => l.includes("Assistant said")).length);
console.log(execFileSync("python", ["scripts/mistakes.py", "--dir", tmp], { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } }));
