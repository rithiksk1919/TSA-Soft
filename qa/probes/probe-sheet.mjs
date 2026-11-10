// Opens and closes a drawer sheet at phone and desktop widths; records per-frame sheet transforms,
// forced-layout reads are not visible here, so it reports frame timing, final transform/opacity and
// will-change at rest. usage: node qa/probes/probe-sheet.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
for (const [w, h] of [[390, 844], [1360, 900]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:5180/#test-practice");
  await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6 && window.SkillBridge.store.data.cards);
  await p.waitForTimeout(1500);
  const rec = () => p.evaluate(() => new Promise(res => { const s = document.getElementById("sheet"), out = [], t0 = performance.now(); let l = t0;
    (function f(n) { out.push({ dt: n - l, tf: s.style.transform, wc: s.style.willChange }); l = n; if (n - t0 < 1400) requestAnimationFrame(f); else res(out); })(t0); }));
  const r1 = rec(); await p.locator('.dslot[data-i="1"] .drawer').click(); const o = await r1;
  await p.waitForTimeout(800);
  const rest = await p.evaluate(() => { const s = document.getElementById("sheet"); return { tf: s.style.transform, op: s.style.opacity, wc: s.style.willChange, scrimWc: document.getElementById("sheet-scrim").style.willChange }; });
  const r2 = rec(); await p.keyboard.press("Escape"); const c = await r2;
  await p.waitForTimeout(800);
  const after = await p.evaluate(() => ({ hidden: document.getElementById("sheet").hidden, wc: document.getElementById("sheet").style.willChange }));
  const stat = a => { const d = a.slice(2).map(x => x.dt); return { fps: +(1000 / (d.reduce((x, y) => x + y) / d.length)).toFixed(1), worst: +Math.max(...d).toFixed(1), promoted: a.some(x => x.wc) }; };
  console.log(w, JSON.stringify({ open: stat(o), firstTf: o[1].tf, rest, close: stat(c), after }));
  await p.close();
}
await b.close();
