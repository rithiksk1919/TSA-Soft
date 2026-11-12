// Screenshots of the school hub's 3D dollhouse at a few sizes, at rest, tilted and with a room pulled forward.
import { chromium } from "@playwright/test";

const out = process.argv[2] || "qa/hub3d";
const browser = await chromium.launch();
const errors = [];
for (const [w, h] of [[1440, 900], [1024, 768], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(w + ": " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(w + ": " + m.text()); });
  await page.goto("http://127.0.0.1:5180/");
  await page.waitForSelector(".school .room");
  await page.waitForTimeout(600);
  const school = page.locator(".school");
  await school.screenshot({ path: `${out}-${w}-rest.png` });
  await page.screenshot({ path: `${out}-${w}-page.png` });
  if (w > 700) {
    const box = await school.boundingBox();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.2);
    await page.waitForTimeout(900);
    await school.screenshot({ path: `${out}-${w}-tilt.png` });
    const room = await page.locator('.room[data-room="library"]').boundingBox();
    await page.mouse.move(room.x + room.width / 2, room.y + room.height / 2);
    await page.waitForTimeout(900);
    await school.screenshot({ path: `${out}-${w}-hover.png` });
    // The topmost element under a room's centre is that room (or inside it).
    const hit = await page.evaluate(() => [...document.querySelectorAll(".school .room")].map((r) => {
      const b = r.getBoundingClientRect();
      const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return r.dataset.room + ":" + (e && r.contains(e) ? "ok" : (e ? e.className || e.tagName : "none"));
    }));
    console.log(w, hit.join(" "));
  }
  await page.close();
}
console.log("errors:", errors.length ? errors : "none");
await browser.close();
