import { chromium } from "@playwright/test";
const [rate = "4", mode = "var"] = process.argv.slice(2);
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1300);
if (mode === "direct") await p.evaluate(() => {
  // Experiment: stop writing --p on the stage; write transforms on the layers directly.
  const st = document.getElementById("cam-stage"); const set = st.style.setProperty.bind(st.style);
  const sw = document.getElementById("world").clientWidth;
  const tr = document.getElementById("track"), wall = document.querySelector(".layer--wall"), floor = document.querySelector(".layer--floor");
  st.style.setProperty = (k, v) => { if (k !== "--p") return set(k, v); const p = +v; tr.style.transform = `translateX(${-p * sw}px)`; wall.style.transform = `translateX(${-0.6 * p * sw}px)`; floor.style.transform = `translateX(${-1.12 * p * sw}px)`; };
});
const cdp = await p.context().newCDPSession(p);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: +rate });
const fr = p.evaluate(() => new Promise((res) => { const d = []; let l = performance.now(); const t0 = l; (function f(n) { d.push(n - l); l = n; if (n - t0 < 1300) requestAnimationFrame(f); else res(d.slice(2)); })(l); }));
await p.click("#to-cabinet");
const d = await fr; const mean = d.reduce((a, b) => a + b) / d.length;
console.log(`rate ${rate} mode ${mode}: ${(1000 / mean).toFixed(1)} fps over ${d.length} frames`);
await b.close();
