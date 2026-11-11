import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 }, reducedMotion: "reduce" });
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
const st = () => p.evaluate(() => ({ room: window.SkillBridge.room.state(), book: window.SkillBridge.bookOpen(), reader: document.getElementById("reader").className }));
await p.click('.rnav__btn[data-station="learn"]'); await p.waitForTimeout(600); console.log("enter", JSON.stringify(await st()));
await p.click('.rbooks__btn[data-book="biology"]'); await p.waitForTimeout(900); console.log("open", JSON.stringify(await st()));
await p.keyboard.press("Escape"); await p.waitForTimeout(900); console.log("close", JSON.stringify(await st()));
console.log("errs", JSON.stringify(errs)); await b.close();
