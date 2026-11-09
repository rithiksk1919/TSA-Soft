import { chromium } from "@playwright/test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto("http://127.0.0.1:5180/dashboard.html"); await p.waitForSelector("html.is-ready"); await p.waitForTimeout(300);
await p.hover(".due__row:nth-child(2) .due__link"); await p.hover(".book3d:nth-child(1) .book3d__link"); await p.waitForTimeout(400);
await p.screenshot({ path: "qa/dashboard/d3a-1920.png" });
await p.hover(".due__row:nth-child(2) .due__link"); await p.waitForTimeout(400);
const el = await p.$(".card--due"); await el.screenshot({ path: "qa/dashboard/d3a-due-hover.png" });
await b.close();
