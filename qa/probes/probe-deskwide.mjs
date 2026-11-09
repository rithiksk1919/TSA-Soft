// Screenshot the reading desk (#desk) at given sizes.
import { chromium } from "@playwright/test";
const sizes = (process.argv[2] || "2000x1015,1536x864,1280x720,1024x700").split(",").map((s) => s.split("x").map(Number));
const b = await chromium.launch();
for (const [w, h] of sizes) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://127.0.0.1:5180/#desk");
  await p.waitForTimeout(3500);
  await p.screenshot({ path: `qa/desk-${w}.png` });
  console.log(w, h, await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map(Math.round).join(","); }; return JSON.stringify({ top: r("#dk-top"), stage: r("#dk-stage"), tutor: r("#tutor"), paper: r("#dk-paper"), sh: document.getElementById("desk").scrollHeight }); }));
  await p.close();
}
await b.close();
