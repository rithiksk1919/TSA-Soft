import { chromium } from "@playwright/test";
const [withBook = "yes"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
if (withBook === "yes") { await p.click('.book[data-id="physics"]'); await p.waitForTimeout(2600); await p.keyboard.press("Escape"); await p.waitForTimeout(2200); }
const info = await p.evaluate(() => ({ active: document.activeElement.className, running: document.getAnimations().filter((a) => a.playState === "running").map((a) => a.animationName || a.id || "waapi").length }));
const cdp = await p.context().newCDPSession(p);
const run = async (label, ms, act) => {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const fr = p.evaluate((ms) => new Promise((res) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < ms) requestAnimationFrame(f); else res(d.slice(2)); })(l); }), ms);
  await act(); const d = await fr; await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  console.log(`${label}: ${(1000 / (d.reduce((a, b) => a + b) / d.length)).toFixed(1)} fps`);
};
console.log("after book:", JSON.stringify(info));
await run("camera", 1300, () => p.click("#to-cabinet")); await p.waitForTimeout(1800);
await run("drawer", 1800, () => p.click('.dslot[data-i="0"] .drawer'));
await b.close();
