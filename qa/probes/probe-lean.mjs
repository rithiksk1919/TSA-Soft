import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1000);
console.log(await p.evaluate(() => [...document.querySelectorAll(".station3--shelf .book3")].filter(e => /rotateZ/.test(e.style.transform)).map(e => { const r = e.getBoundingClientRect(); return e.style.transform + " | " + [r.left, r.top, r.width, r.height].map(Math.round); })));
console.log(await p.evaluate(() => { const e = [...document.querySelectorAll(".station3--shelf .book3")].find(e => /rotateZ/.test(e.style.transform)); return [...e.children].map(f => f.className + " " + f.getAttribute("style") + " | " + JSON.stringify(f.getBoundingClientRect()) + " vis " + getComputedStyle(f).visibility + " bg " + getComputedStyle(f).backgroundColor); }));
await b.close();
