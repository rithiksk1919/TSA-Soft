import { chromium } from "@playwright/test";
const variants = {
  none: '',
  willchange: '.cam3{will-change:transform}',
  noenvafter: '.env::after{display:none!important}',
  noroomafter: '.room::after{display:none!important}',
  both: '.cam3{will-change:transform}.env::after{display:none!important}',
};
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const out = {};
for (let rep = 0; rep < 3; rep++) for (const [k, css] of Object.entries(variants)) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5180/"); if (css) await p.addStyleTag({ content: css }); await p.waitForTimeout(1000);
  const fr = p.evaluate(() => new Promise((res) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < 1400) requestAnimationFrame(f); else res(d.slice(2)); })(l); }));
  for (let i = 0; i < 14; i++) { await p.mouse.move(200 + i * 80, 300 + (i % 3) * 120); await p.waitForTimeout(60); }
  const d = await fr; (out[k] ||= []).push(1000 / (d.reduce((a, c) => a + c) / d.length));
  await p.close();
}
for (const k in out) console.log(k.padEnd(9), out[k].sort((a, c) => a - c)[1].toFixed(1), "fps", out[k].map(v => v.toFixed(0)).join("/"));
await b.close();
