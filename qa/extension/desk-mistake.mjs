// A mistake you added becomes a reading-desk exercise. Adds a test mistake, has Gemini write the
// exercise, sits at the desk with it, works the first part, then deletes the test mistake.
import { chromium } from "playwright";
const sid = process.argv[2] || "chem";
const B = "http://127.0.0.1:8000";
const post = (u, body) => fetch(B + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const add = await post("/api/my-subjects/" + sid + "/mistakes", { question: "How many valence electrons does oxygen have?", your_answer: "8" });
await post("/api/my-subjects/" + sid + "/mistakes/" + add.id + "/explain");
let t = Date.now();
const desk = await post("/api/my-subjects/" + sid + "/mistakes/" + add.id + "/desk");
console.log("desk exercise in", Math.round((Date.now() - t) / 1000), "s:", JSON.stringify(desk));
const dj = await (await fetch(B + "/library/data/desk.json")).json();
const sc = dj.scenarios.find((x) => x.id === "u-" + sid + "-" + add.id);
console.log("scenarios:", dj.scenarios.map((x) => x.call).join(", "));
if (sc) console.log(sc.title, "|", sc.problem, "| theirs", sc.theirs, "| key", sc.key, "\n steps:", sc.steps.map((s) => (s.wrong ? "[WRONG] " : "") + s.text).join(" || "));
const b = await chromium.launch({ headless: true });
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto(B + "/library/#desk-u-" + sid + "-" + add.id);
await p.waitForTimeout(6000);
await p.screenshot({ path: "qa/extension/desk-1.png" });
const opt = p.locator(".dk-choice, .choice, [data-choice]").first();
if (await opt.count()) { await opt.click(); await p.waitForTimeout(5000); }
await p.screenshot({ path: "qa/extension/desk-2.png" });
await fetch(B + "/api/my-subjects/" + sid + "/mistakes/" + add.id, { method: "DELETE" });
console.log(errs.join("; ") || "no page errors");
await b.close();
