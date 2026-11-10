// Flat scenes camera move (shelf <-> cabinet) frame rate with the GPU on, at 1x and 4x CPU throttle.
// usage: node qa/probes/probe-perf-cam.mjs [port]
import { chromium } from "@playwright/test";
const port = process.argv[2] || "5180";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`http://127.0.0.1:${port}/#test-shelf`);
await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6); await p.waitForTimeout(1500);
const cdp = await p.context().newCDPSession(p);
const res = [];
for (const rate of [1, 4]) for (const [label, sel] of [["to cabinet", "#to-cabinet, #seg-practice"], ["to shelf", "#to-shelf, #seg-learn"]]) {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const fr = p.evaluate(() => new Promise(r => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < 1300) requestAnimationFrame(f); else r(d.slice(2)); })(l); }));
  await p.locator(sel).filter({ visible: true }).first().click();
  const d = await fr; await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }); await p.waitForTimeout(700);
  res.push(`${label} x${rate}: ${(1000 / (d.reduce((a, c) => a + c) / d.length)).toFixed(1)} fps, worst ${Math.max(...d).toFixed(1)}ms`);
}
console.log(port, res.join(" | "));
await b.close();
