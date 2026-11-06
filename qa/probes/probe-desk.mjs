// Probe: the reading desk. Enters from the room, plays the physics scenario through, screenshots stages.
// usage: node qa/probes/probe-desk.mjs [width] [height] [reduce]
import { chromium } from "@playwright/test";
const W = +(process.argv[2] || 1360), H = +(process.argv[3] || 860), reduce = process.argv[4] === "reduce";
const tag = W + (reduce ? "-rm" : "");
const b = await chromium.launch(); const errs = [];
const p = await b.newPage({ viewport: { width: W, height: H }, reducedMotion: reduce ? "reduce" : "no-preference" });
p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.goto("http://127.0.0.1:5180/"); await p.evaluate(() => localStorage.removeItem("sb_desk")); await p.waitForTimeout(1200);
await p.click('.rnav__btn[data-station="apply"]');
await p.waitForTimeout(700); await p.screenshot({ path: `qa/traces/desk-enter-${tag}.png` });
const choose = async (text) => { const c = p.locator(".tchoice", { hasText: text }); await c.waitFor({ timeout: 15000 }); await c.click(); };
const judge = async (n, v) => { const btn = p.locator(`.dk-card:nth-child(${n}) .dk-card__judge button[data-v="${v}"]`); await btn.waitFor({ state: "visible", timeout: 15000 }); await btn.click(); };
await p.locator(".tchoice").first().waitFor({ timeout: 15000 });
await p.screenshot({ path: `qa/traces/desk-read-${tag}.png` });
await choose("The normal force on the block"); // a wrong pick first
await choose("acceleration down the slope");
await judge(1, "ok");
await judge(2, "wrong"); // a miss: step 2 is fine
await judge(3, "ok");    // a miss: step 3 is the wrong one
await p.click("#tutor-hint");
await p.fill("#tutor-input", "why is it cos?"); await p.press("#tutor-input", "Enter");
await judge(3, "wrong");
await p.locator(".tchoice").first().waitFor({ timeout: 15000 }); await p.waitForTimeout(400);
await p.screenshot({ path: `qa/traces/desk-wrong-${tag}.png` });
await choose("mg cos θ, the part");
await choose("N = mg cos 30° = 19.6");
await p.locator(".tchoice", { hasText: "Next scenario" }).waitFor({ timeout: 20000 }); await p.waitForTimeout(300);
await p.screenshot({ path: `qa/traces/desk-done-${tag}.png` });
await choose("Next scenario");
await p.waitForTimeout(200);
console.log(JSON.stringify(await p.evaluate(() => ({ dbg: window.SkillBridge.desk.debug(), saved: localStorage.getItem("sb_desk") }))));
await p.screenshot({ path: `qa/traces/desk-next-${tag}.png` });
await p.goBack().catch(() => {});
console.log("errors", JSON.stringify(errs)); await b.close();
