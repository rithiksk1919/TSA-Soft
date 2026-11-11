import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
console.log(await p.evaluate(() => ({ mt: document.getElementById("cam3").style.marginTop, hh: document.getElementById("room").style.getPropertyValue("--head-h"),
  st: window.SkillBridge.room.state(), pl: [...document.querySelectorAll(".plaque, .pendant .f3")].map(e => Math.round(e.getBoundingClientRect().top)) })));
await b.close();
