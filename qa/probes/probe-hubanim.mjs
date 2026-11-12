// Frames of each school room's hover animation, and the full-screen hub layout.
import { chromium } from "@playwright/test";
const out = process.argv[2] || "qa/hub3d/anim";
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://127.0.0.1:5180/");
await page.waitForSelector(".school .room");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}-page.png` });
const fit = await page.evaluate(() => { const s = document.querySelector(".school").getBoundingClientRect(); return { top: s.top, bottom: s.bottom, vh: innerHeight }; });
console.log("school", JSON.stringify(fit));
for (const id of ["gym", "classroom", "library", "lunch"]) {
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  const room = page.locator(`.room[data-room="${id}"]`);
  const b = await room.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.7);
  for (const t of [300, 900, 1500, 2100, 2700]) {
    await page.waitForTimeout(t === 300 ? 300 : 600);
    await room.screenshot({ path: `${out}-${id}-${t}.png` });
  }
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
