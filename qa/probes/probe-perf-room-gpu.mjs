// Room frame rates with the GPU on: pointer look, station hover, flights. usage: node qa/probes/probe-perf-room-gpu.mjs [port]
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] }); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:" + (process.argv[2] || "5180") + "/"); await p.waitForTimeout(1300);
const cdp = await p.context().newCDPSession(p);
const run = async (label, ms, rate, act) => {
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
  const fr = p.evaluate((ms) => new Promise((res) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < ms) requestAnimationFrame(f); else res(d.slice(2)); })(l); }), ms);
  await act(); const d = await fr; await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const avg = d.reduce((a, b) => a + b) / d.length, worst = Math.max(...d);
  console.log(`${label} x${rate}: ${(1000 / avg).toFixed(1)} fps, worst frame ${worst.toFixed(1)}ms`);
};
for (const rate of [1, 4]) {
  await run("pointer look", 1200, rate, async () => { for (let i = 0; i < 12; i++) { await p.mouse.move(200 + i * 90, 300 + (i % 3) * 120); await p.waitForTimeout(60); } });
  await p.waitForTimeout(400);
  await run("hover stations", 1200, rate, async () => { for (const s of ["learn", "apply", "practice", "apply"]) { await p.hover(`.rnav__btn[data-station=${s}]`); await p.waitForTimeout(200); } });
  await p.mouse.move(720, 450); await p.waitForTimeout(400);
  await run("fly to shelf", 1400, rate, () => p.click(".rnav__btn[data-station=learn]")); await p.waitForTimeout(800);
  await run("fly back", 1400, rate, () => p.click(".station-back")); await p.waitForTimeout(1200);
}
await b.close();
