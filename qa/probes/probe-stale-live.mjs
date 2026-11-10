// Phone layout: open Flashcards, close, open Index, then change the store. A stale Flashcards
// subscription would rewrite the panel body (DJ2). Prints how many times the body was rewritten and
// whether the Index view survived. usage: node qa/probes/probe-stale-live.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:5180/#test-practice");
await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6 && window.SkillBridge.store.data.cards);
await p.waitForTimeout(1500);
await p.locator('.dslot[data-i="0"] .drawer').click(); await p.waitForTimeout(1800);
const fc = await p.evaluate(() => !!document.querySelector("#sheet .panel-tools"));
await p.keyboard.press("Escape"); await p.waitForTimeout(1500);
await p.locator('.dslot[data-i="1"] .drawer').click(); await p.waitForTimeout(1800);
const r = await p.evaluate(() => new Promise(res => {
  const body = document.querySelector("#sheet .sheet__body") || document.querySelector("#sheet [class*=body]");
  const before = body.innerHTML.length; let writes = 0;
  new MutationObserver(m => { writes += m.length; }).observe(body, { childList: true });
  const s = window.SkillBridge.store, id = s.cards()[0].id;
  s.setBox(id, s.box(id) === 3 ? 2 : 3);
  setTimeout(() => res({ writes, flashcardsViewNow: !!body.querySelector(".panel-tools"), sameLength: body.innerHTML.length === before }), 400);
}));
console.log(JSON.stringify({ flashcardsOpened: fc, ...r }));
await b.close();
