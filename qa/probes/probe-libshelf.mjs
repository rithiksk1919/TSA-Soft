// Screenshots of the library's shelf after the spine panels: the room and the bookshelf station.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5180/library/");
await page.waitForFunction(() => window.SkillBridge && window.SkillBridge.room && window.SkillBridge.room.state() === "overview", null, { timeout: 15000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: "qa/zoom/lib-room.png" });
await page.locator('.rnav__btn[data-station="learn"]').click();
await page.waitForTimeout(2200);
await page.screenshot({ path: "qa/zoom/lib-shelf.png" });
await browser.close();
