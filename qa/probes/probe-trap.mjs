import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.click('.book[data-id="physics"]'); await p.waitForTimeout(2600);
console.log(await p.evaluate(() => ({ open: document.getElementById("reader").className, bookOpen: window.SkillBridge.bookOpen(), active: document.activeElement.id })));
for (let i = 0; i < 2; i++) {
  await p.keyboard.press("Tab");
  console.log(await p.evaluate(() => { const a = document.activeElement; return a.tagName + "#" + a.id + "." + a.className + " inReader=" + document.getElementById("reader").contains(a) + " stack? libInert=" + document.getElementById("library").inert; }));
}
await b.close();
