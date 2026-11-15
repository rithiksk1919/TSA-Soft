// Clicking a mistake in a book opens it at the reading desk; opening the desk starts on your newest.
// Uses a temporary Math book (deleted at the end) so the Action Log's maths mistakes file into it.
import { chromium } from "playwright";
const B = "http://127.0.0.1:8000";
const post = (u, body) => fetch(B + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const sub = await post("/api/my-subjects", { name: "Zz Math Desk" });
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B + "/library/#book-my-" + sub.id);
await p.waitForSelector(".toc, .mine-empty", { timeout: 20000 });
await p.waitForTimeout(800);
await p.click('[data-open="mistakes"]');
await p.waitForTimeout(400);
await p.screenshot({ path: "qa/extension/cd-1-list.png" });
console.log("clickable mistakes:", await p.locator(".mm__open").count());
await p.locator(".mm__open", { hasText: "7 × 8" }).click();
await p.waitForURL(/#desk/, { timeout: 15000 }).catch(() => errs.push("did not go to the desk"));
await p.waitForTimeout(5000);
await p.screenshot({ path: "qa/extension/cd-2-desk.png" });
console.log("desk sheet:", (await p.textContent(".dk-paper__title").catch(() => "none")), "|", await p.textContent(".dk-paper__call").catch(() => ""));
await p.goto(B + "/library/#desk");
await p.reload();
await p.waitForTimeout(5000);
console.log("desk opened on:", await p.textContent(".dk-paper__title").catch(() => "none"), "| tabs:", (await p.locator(".chip-btn").allTextContents()).join(" / "));
await fetch(B + "/api/my-subjects/" + sub.id, { method: "DELETE" });
console.log(errs.join("; ") || "no page errors");
await b.close();
