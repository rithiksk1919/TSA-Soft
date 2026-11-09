// usage: node qa/probes/probe-perf-gpu.mjs  -> interleaved runs of baseline (5191) vs current (5180), GPU on
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const res = {};
async function once(port, rate) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(1200);
  const cdp = await p.context().newCDPSession(p);
  const out = {};
  const run = async (label, ms, act) => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate });
    const fr = p.evaluate((ms) => new Promise((r) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < ms) requestAnimationFrame(f); else r(d.slice(2)); })(l); }), ms);
    await act(); const d = await fr; await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    out[label] = { fps: 1000 / (d.reduce((a, c) => a + c) / d.length), p95: d.sort((a, c) => a - c)[Math.floor(d.length * 0.95)] };
  };
  await run("look", 1400, async () => { for (let i = 0; i < 14; i++) { await p.mouse.move(200 + i * 80, 300 + (i % 3) * 120); await p.waitForTimeout(60); } });
  await p.mouse.move(720, 450); await p.waitForTimeout(400);
  await run("hover", 1200, async () => { for (const s of ["learn", "apply", "practice", "apply"]) { await p.focus(`.rnav__btn[data-station=${s}]`); await p.waitForTimeout(250); } });
  await run("fly", 1400, () => p.click(".rnav__btn[data-station=learn]"));
  await p.close();
  return out;
}
for (const rate of [1, 4]) for (let i = 0; i < 3; i++) for (const [name, port] of [["base", 5191], ["now", 5180]]) {
  const o = await once(port, rate);
  for (const k in o) ((res[`${name} x${rate} ${k}`] ||= [])).push(o[k]);
}
for (const k of Object.keys(res).sort()) {
  const fps = res[k].map(r => r.fps).sort((a, c) => a - c)[1], p95 = res[k].map(r => r.p95).sort((a, c) => a - c)[1];
  console.log(k.padEnd(18), `median ${fps.toFixed(1)} fps, p95 frame ${p95.toFixed(1)}ms`);
}
await b.close();
