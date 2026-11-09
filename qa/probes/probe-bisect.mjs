import { chromium } from "@playwright/test";
const variants = {
  none: "",
  blur: ".sun-patch{filter:none!important}",
  masks: ".sun-shaft,.shade3--strip{-webkit-mask-image:none!important;mask-image:none!important}",
  glows: ".glow3{display:none!important}",
  shades: ".shade3{display:none!important}",
  sunall: ".sun-patch,.sun-shaft{display:none!important}",
  overlays: ".env::after,.room::after{display:none!important}",
  wood: ".wood .f3,.cabinet3 .f3{background-image:none!important}",
  books: ".book3 .f3--front{background:var(--c)!important}",
  walls: ".wall,.floor,.ceiling{background-image:none!important}",
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
