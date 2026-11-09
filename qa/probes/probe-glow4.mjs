import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.addStyleTag({ content: ".station3--shelf .glow3--hot{display:block!important;opacity:1!important;background:red!important;transition:none!important}" }); await p.waitForTimeout(1200);
await p.screenshot({ path: "qa/polish/g4.png" });
console.log(await p.evaluate(() => [...document.querySelectorAll(".station3--shelf .glow3--hot")].map(e => e.getAttribute("style"))));
await b.close();
