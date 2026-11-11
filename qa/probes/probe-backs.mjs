// Walk every library state; list visible navigation-ish buttons; check each "back" returns.
import { chromium } from "@playwright/test";
const W = +(process.argv[2] || 1440), H = +(process.argv[3] || 900);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: H } });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
const RX = /back|library|dashboard|close|←|learn$|practice them|all /i;
async function quiet() { await p.waitForTimeout(400); await p.waitForFunction(() => { const sb = window.SkillBridge; return (!sb.activeSprings || sb.activeSprings() === 0) && document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.getTiming().iterations !== Infinity).length === 0; }, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(300); }
async function dump(tag) {
  const list = await p.evaluate((src) => {
    const rx = new RegExp(src, "i");
    return [...document.querySelectorAll("button, a")].filter((e) => {
      const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      if (!r.width || !r.height || cs.visibility === "hidden" || +cs.opacity === 0) return false;
      if (r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return false;
      const t = (e.textContent.trim() || e.getAttribute("aria-label") || "").replace(/\s+/g, " ");
      return rx.test(t) || rx.test(e.getAttribute("aria-label") || "");
    }).map((e) => { const r = e.getBoundingClientRect(); return (e.closest("[inert]") ? "(DEAD) " : "") + `${(e.id ? "#" + e.id : "." + (e.className || e.tagName).toString().split(" ")[0])} "${(e.textContent.trim() || e.getAttribute("aria-label")).replace(/\s+/g, " ").slice(0, 40)}" @${Math.round(r.left)},${Math.round(r.top)}`; });
  }, RX.source);
  const st = await p.evaluate(() => ({ room: window.SkillBridge.room && window.SkillBridge.room.state(), hash: location.hash }));
  console.log(`\n[${tag}] room=${st.room} hash=${st.hash}\n  ` + list.join("\n  "));
  await p.screenshot({ path: `qa/backs/${W}-${tag}.png` });
}
const go = async (hash = "") => { await p.goto("about:blank"); await p.goto("http://127.0.0.1:5180/" + hash); await p.waitForTimeout(1500); await quiet(); };
const fs = await import("fs"); fs.mkdirSync("qa/backs", { recursive: true });

await go(); await dump("01-overview");
// Learn station
await p.click('.rnav__btn[data-station=learn]'); await quiet(); await dump("02-learn");
await p.click('.rbooks__btn[data-book=physics]', { force: true }); await p.waitForTimeout(2500); await quiet(); await dump("03-book");
await p.locator("#back").click(); await p.waitForTimeout(2000); await quiet(); await dump("04-book-closed");
await p.locator(".station-back").click(); await quiet(); await dump("05-learn-left");
// Apply
await p.click('.rnav__btn[data-station=apply]'); await p.waitForTimeout(2500); await quiet(); await dump("06-desk");
await p.locator("#desk-close").click(); await p.waitForTimeout(2500); await quiet(); await dump("07-desk-left");
// Practice
await p.click('.rnav__btn[data-station=practice]'); await p.waitForTimeout(2000); await quiet(); await dump("08-practice");
const drawers = await p.$$eval(".dslot", (s) => s.map((x) => x.dataset.id));
console.log("drawers:", drawers);
for (const id of drawers) {
  await p.locator(`.dslot[data-id="${id}"] .drawer`).click({ force: true }); await p.waitForTimeout(1500); await quiet(); await dump(`09-drawer-${id}`);
  if (id === "flashcards") { await p.locator("#review-all:visible, .sheet__body .ibtn:has-text(\"Review All\"):visible").first().click(); await p.waitForTimeout(1200); await quiet(); await dump("09b-review"); await p.keyboard.press("Escape"); await quiet(); await dump("09c-review-closed"); }
  // open the first item if there's a list of items, to reach a detail view with a back link
  const item = p.locator(".sheet__body button:not([data-back]):not(.chip):visible").first();
  if (await p.locator("#sheet:not([hidden])").count() && await item.count()) { await item.click().catch(() => {}); await quiet(); await dump(`10-detail-${id}`); const bk = p.locator("[data-back]:visible").first(); if (await bk.count()) { await bk.click(); await quiet(); } }
  await p.keyboard.press("Escape"); await p.waitForTimeout(800); await quiet();
  if ((await p.evaluate(() => window.SkillBridge.debug.drawer())) !== "closed") { await p.keyboard.press("Escape"); await quiet(); }
}
await dump("11-practice-after");
await p.locator(".station-back").click(); await quiet(); await dump("12-practice-left");
// Deep links
for (const h of ["#shelf", "#practice", "#desk"]) { await go(h); await dump("13-deep" + h.slice(1)); const l = p.locator(".station-back:visible, #desk-close:visible").first(); if (await l.count()) { await l.click(); await p.waitForTimeout(2500); await quiet(); await dump("14-deep" + h.slice(1) + "-back"); } }
await go(); await p.locator(".room__dash").click(); await p.waitForURL(/dashboard/); console.log("\n[dashboard link] ->", p.url(), await p.title());
console.log("\nerrors", JSON.stringify(errs)); await b.close();
