// While the tutor streams its first messages, samples the log every frame: how often its scroll
// position moves, and whether it ends at the bottom. usage: node qa/probes/probe-desk-stream.mjs
import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [w, h] of [[1440, 900], [1000, 700]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.addInitScript(() => {
    window.__s = { frames: 0, moves: 0, back: 0 }; let last = 0;
    (function f() { const l = document.querySelector(".tutor__log"); if (l && l.scrollHeight > l.clientHeight) { window.__s.frames++; if (l.scrollTop !== last) { window.__s.moves++; if (l.scrollTop < last) window.__s.back++; last = l.scrollTop; } } requestAnimationFrame(f); })();
  });
  await p.goto("http://127.0.0.1:5180/#desk"); await p.waitForTimeout(9000);
  const end = await p.evaluate(() => { const l = document.querySelector(".tutor__log"); return Math.round(l.scrollHeight - l.clientHeight - l.scrollTop); });
  console.log(w, JSON.stringify({ ...(await p.evaluate(() => window.__s)), distanceFromBottomAtEnd: end }));
  await p.close();
}
await b.close();
