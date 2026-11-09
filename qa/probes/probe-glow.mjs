import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.screenshot({ path: "qa/polish/g-off.png" });
for (const st of ["learn", "apply", "practice"]) {
  await p.focus(`.rnav__btn[data-station=${st}]`); await p.waitForTimeout(450);
  await p.screenshot({ path: `qa/polish/g-${st}.png` });
}
await b.close();
