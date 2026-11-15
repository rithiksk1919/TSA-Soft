// An organised subject book: reorganise a subject, open it from the room, look at a chapter,
// the mistake review and a source file. usage: node qa/extension/organized.mjs <subject-id>
import { chromium } from "playwright";
const sid = process.argv[2];
const B = "http://127.0.0.1:8000";
await fetch(B + "/api/my-subjects/" + sid + "/organize", { method: "POST" });
const t0 = Date.now();
for (;;) {
  const d = await (await fetch(B + "/api/my-subjects")).json();
  const s = d.subjects.find((x) => x.id === sid);
  if (s.organized.state !== "running") { console.log("organised in", Math.round((Date.now() - t0) / 1000), "s:", JSON.stringify(s.organized)); break; }
  await new Promise((r) => setTimeout(r, 2000));
}
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B + "/library/#book-my-" + sid);
await p.waitForSelector(".org-title", { timeout: 20000 });
await p.waitForTimeout(1500);
await p.screenshot({ path: "qa/extension/org-1-chapter.png" });
await p.click('[data-open="mistakes"]');
await p.waitForTimeout(400);
await p.screenshot({ path: "qa/extension/org-2-mistakes.png" });
await p.click('[data-open="ch-0"]');
await p.click(".org-check summary >> nth=0").catch(() => errs.push("no check questions"));
await p.waitForTimeout(300);
await p.screenshot({ path: "qa/extension/org-3-check.png" });
await p.click(".org-src >> nth=0");
await p.waitForTimeout(800);
await p.screenshot({ path: "qa/extension/org-4-source.png" });
console.log(errs.join("\n") || "no page errors");
await b.close();
