import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const hide of ["none", ".nb-cover", ".lamp-pool", ".glow3--lamp", ".station3--desk .shade3", ".book3"]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1000);
  if (hide !== "none") await p.addStyleTag({ content: `.station3--desk ${hide.replace(".station3--desk ", "")} { visibility: hidden !important; }` });
  await p.waitForTimeout(100);
  await p.screenshot({ path: `qa/polish/band-${hide.replace(/[^a-z0-9]/gi, "")}.png`, clip: await p.evaluate(() => { const b = document.querySelector(".page3--right").getBoundingClientRect(); return { x: b.left - 10, y: b.top - 10, width: b.width + 20, height: b.height + 20 }; }) });
  await p.close();
}
await b.close();
