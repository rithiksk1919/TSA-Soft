import { chromium } from "@playwright/test";
const b = await chromium.launch();
for (const [k, css] of [["off", ""], ["forceblock", ".station3--shelf .glow3--hot{display:block!important;opacity:1!important;transition:none!important}"], ["forcevis", ".glow3--hot{display:block!important;opacity:0!important;visibility:hidden!important}.station3--shelf .glow3--hot{opacity:1!important;visibility:visible!important;transition:none!important}"]]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto("http://127.0.0.1:5180/"); if (css) await p.addStyleTag({ content: css }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `qa/polish/g3-${k}.png` }); await p.close();
}
await b.close();
