import { chromium } from "@playwright/test";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] }); const errs = [];
for (const [w, h] of [[1440, 900], [2560, 1300], [390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1000);
  await p.click(".rnav__btn[data-station=learn]"); await p.waitForTimeout(250);
  await p.screenshot({ path: `qa/polish/st-${w}-learn-mid.png` }); await p.waitForTimeout(1300);
  await p.screenshot({ path: `qa/polish/st-${w}-learn.png` });
  await p.click(".station-back"); await p.waitForTimeout(1600);
  await p.click(".rnav__btn[data-station=practice]"); await p.waitForTimeout(250);
  await p.screenshot({ path: `qa/polish/st-${w}-practice-mid.png` }); await p.waitForTimeout(1600);
  await p.screenshot({ path: `qa/polish/st-${w}-practice.png` });
  console.log(w, await p.evaluate(() => window.SkillBridge.room.state()));
  await p.close();
}
console.log("errors", JSON.stringify(errs)); await b.close();
