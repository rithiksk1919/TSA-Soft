// Which requests on the hub return 404.
import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("response", (r) => { if (r.status() >= 400) console.log(r.status(), r.url()); });
await page.goto("http://127.0.0.1:5180/");
await page.waitForTimeout(2500);
await browser.close();
