import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
for (const port of [5191, 5180, 5191, 5180]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`http://127.0.0.1:${port}/`); await p.waitForTimeout(1200);
  const cdp = await p.context().newCDPSession(p); await cdp.send("Performance.enable");
  const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  for (let i = 0; i < 20; i++) { await p.mouse.move(200 + i * 55, 300 + (i % 3) * 120); await p.waitForTimeout(50); }
  await p.waitForTimeout(300);
  const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
  const d = (k) => +(m1[k] - m0[k]).toFixed(3);
  console.log(port, { layouts: d("LayoutCount"), styles: d("RecalcStyleCount"), layoutMs: Math.round(d("LayoutDuration") * 1000), styleMs: Math.round(d("RecalcStyleDuration") * 1000), scriptMs: Math.round(d("ScriptDuration") * 1000), taskMs: Math.round(d("TaskDuration") * 1000), nodes: m1.Nodes, layers: m1.LayoutObjects });
  await p.close();
}
await b.close();
