// Cabinet scene renders: closed, and each drawer frozen part-way open and fully open (flat scenes, GPU on).
// Saves qa/poses/cab-<tag>-<n>.png. usage: node qa/probes/probe-cabinet-shots.mjs <tag>
import { chromium } from "@playwright/test";
const tag = process.argv[2] || "now";
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/#test-practice");
await p.waitForFunction(() => document.querySelectorAll(".dslot").length === 6 && window.SkillBridge.debug.scene() === 1);
await p.waitForTimeout(2000);
await p.screenshot({ path: `qa/poses/cab-${tag}-closed.png` });
for (const i of [0, 3]) {
  await p.locator(`.dslot[data-i="${i}"] .drawer`).click();
  await p.waitForTimeout(3500); await p.screenshot({ path: `qa/poses/cab-${tag}-open${i}.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(3500);
  await p.screenshot({ path: `qa/poses/cab-${tag}-closed-after${i}.png` });
}
await b.close();
