import { chromium } from "@playwright/test";
const variants = {
  none: '',
  floor: '.floor{background-image:repeating-linear-gradient(to right, rgba(40,26,14,.28) 0 2px, transparent 2px 110px)!important}',
  back: '.wall--back{background-image:none!important}',
  sides: '.wall--side{background-image:none!important}',
  ceiling: '.ceiling{background-image:none!important}',
  hotoff: '.glow3--hot{display:none!important}',
  pendlamp: '.glow3--pendant,.glow3--lamp{display:none!important}',
};
const b = await chromium.launch();
for (const [k, css] of Object.entries(variants)) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5180/"); if (css) await p.addStyleTag({ content: css }); await p.waitForTimeout(1200);
  const fr = p.evaluate(() => new Promise((res) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < 1500) requestAnimationFrame(f); else res(d.slice(2)); })(l); }));
  for (let i = 0; i < 14; i++) { await p.mouse.move(200 + i * 80, 300 + (i % 3) * 120); await p.waitForTimeout(60); }
  const d = await fr; console.log(k.padEnd(9), (1000 / (d.reduce((a, b) => a + b) / d.length)).toFixed(1), "fps");
  await p.close();
}
await b.close();
