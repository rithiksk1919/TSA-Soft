// Which parts of the library room cost the most while the camera moves: hide one group at a time
// and time the pointer lean.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5180/library/");
await page.waitForFunction(() => window.SkillBridge && window.SkillBridge.room && window.SkillBridge.room.state() === "overview", null, { timeout: 15000 });
await page.waitForTimeout(1500);
const info = await page.evaluate(() => ({
  anims: document.getAnimations().map((a) => (a.effect && a.effect.target ? a.effect.target.className : "?") + " " + (a.animationName || "")).slice(0, 20),
  top: [...document.querySelectorAll("#world3 > *")].map((e) => e.className + " (" + e.querySelectorAll("*").length + ")")
}));
console.log("animations:", JSON.stringify(info.anims));
console.log("world groups:", info.top.join(" | "));
async function lean() {
  await page.evaluate(() => { window.__g = []; let last = 0; window.__on = true; (function f(t) { if (last) window.__g.push(t - last); last = t; if (window.__on) requestAnimationFrame(f); })(performance.now()); });
  for (let i = 0; i < 30; i++) await page.mouse.move(200 + i * 40, 300 + (i % 5) * 60);
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => { window.__on = false; return window.__g; });
  await page.mouse.move(800, 450); await page.waitForTimeout(600);
  return (1000 / (g.reduce((a, b) => a + b, 0) / g.length)).toFixed(0);
}
const tests = [["nothing hidden", ""],
  ["no shell", ".shell{display:none!important}"],
  ["no desk", ".station3--desk{display:none!important}"],
  ["no catalog", ".station3--catalog{display:none!important}"],
  ["no shelf", ".station3--shelf{display:none!important}"],
  ["no plant+shadows", ".plant,.shadows{display:none!important}"],
  ["no gradients", "#room *{background-image:none!important}"],
  ["no svg anims", "#room svg *{animation:none!important}"],
  ["nothing hidden 2", ""]];
for (const [label, css] of tests) {
  const h = css ? await page.addStyleTag({ content: css }) : null;
  await page.waitForTimeout(400);
  console.log(label.padEnd(24), "fps", await lean());
  if (h) await h.evaluate((n) => n.remove());
  await page.waitForTimeout(300);
}
await browser.close();
