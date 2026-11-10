// Opens a book on the flat shelf and, once it is open, counts running logo animations and finds which
// screen region changes over 1s (what the reader visibly animates). usage: node qa/probes/probe-reading-logos.mjs <tag>
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "now";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/#test-shelf");
await p.waitForFunction(() => document.querySelectorAll(".book").length === 3); await p.waitForTimeout(1200);
await p.locator('.book[data-id="physics"]').click(); await p.waitForTimeout(3500);
const running = await p.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".logo")).map(a => (a.effect.target.closest(".logo--live") ? "live" : a.effect.target.closest(".reader") ? "reader" : "shelf")).reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {}));
await p.screenshot({ path: `qa/poses/read-${tag}-a.png` }); await p.waitForTimeout(1000); await p.screenshot({ path: `qa/poses/read-${tag}-b.png` });
console.log(tag, "running logo animations while reading:", JSON.stringify(running));
await p.keyboard.press("Escape"); await p.waitForTimeout(400);
const closing = await p.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".logo")).length);
await p.waitForTimeout(3000);
const after = await p.evaluate(() => ({ open: !!document.querySelector(".reader.is-open"), flying: document.querySelectorAll(".is-flying").length }));
console.log(tag, "logo animations during the close:", closing, "after close:", JSON.stringify(after));
await b.close();
