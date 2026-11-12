// The classroom with a subject that has no lesson file of its own (built from its worked example),
// on a phone, and with reduced motion.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const errors = [];
for (const [name, opts] of [["ck-wide", { viewport: { width: 1440, height: 900 } }], ["ck-phone", { viewport: { width: 390, height: 844 } }], ["ck-calm", { viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }]]) {
  const page = await browser.newPage(opts);
  page.on("pageerror", (e) => errors.push(name + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(name + ": " + m.text()); });
  await page.goto("http://127.0.0.1:5180/#/classroom?skill=ck_ohms");
  await page.waitForSelector(".c3cam .c3board");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa/classroom/${name}-room.png` });
  for (const st of ["watch", "read", "listen"]) {
    await page.locator(`.bar [data-station="${st}"]`).click();
    await page.waitForSelector(".panel", { timeout: 5000 });
    await page.waitForTimeout(500);
    if (st === "read") await page.keyboard.press("ArrowRight");
    if (st === "watch") await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(800);
    await page.screenshot({ path: `qa/classroom/${name}-${st}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1000);
  }
  await page.close();
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
