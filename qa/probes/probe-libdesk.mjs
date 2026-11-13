// The hitch when the library's reading desk opens: long tasks and what runs in them.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5180/library/");
await page.waitForFunction(() => window.SkillBridge && window.SkillBridge.room && window.SkillBridge.room.state() === "overview", null, { timeout: 15000 });
await page.waitForTimeout(1500);
const client = await page.context().newCDPSession(page);
await client.send("Profiler.enable");
await client.send("Profiler.start");
await page.evaluate(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask" }); window.__t0 = performance.now(); });
await page.locator('.rnav__btn[data-station="apply"]').click();
await page.waitForTimeout(2500);
const { profile } = await client.send("Profiler.stop");
const lt = await page.evaluate(() => ({ t0: Math.round(window.__t0), lt: window.__lt }));
console.log("long tasks (start ms after click, duration):", JSON.stringify(lt.lt.map((x) => [x[0] - lt.t0, x[1]])));
// self time per function
const self = new Map();
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const dt = profile.timeDeltas; 
profile.samples.forEach((id, i) => { const n = byId.get(id); const k = n.callFrame.functionName + " " + n.callFrame.url.split("/").pop() + ":" + n.callFrame.lineNumber; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); });
console.log([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => v.toFixed(1).padStart(7) + " ms  " + k).join("\n"));
await browser.close();
