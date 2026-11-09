import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto("http://127.0.0.1:5180/" + (process.argv[2] || "#practice")); await p.waitForTimeout(3500);
await p.locator('.dslot[data-id="flashcards"] .drawer').click({ force: true }); await p.waitForTimeout(2000);
await p.locator('.sheet__body .ibtn:has-text("Review All")').click(); await p.waitForTimeout(1500);
console.log("review open", await p.evaluate(() => window.SkillBridge.review.isOpen()));
await p.keyboard.press("Escape");
for (const t of [500, 1500, 3000]) { await p.waitForTimeout(t); console.log(t, await p.evaluate(() => ({ review: window.SkillBridge.review.isOpen(), sheetInert: !!document.getElementById("sheet").closest("[inert]"), reviewHidden: document.getElementById("review").hidden, drawer: window.SkillBridge.debug.drawer() }))); }
await p.locator(".sheet__close").click({ timeout: 3000 }).then(() => console.log("close clicked")).catch((e) => console.log("close FAILED", e.message.split("\n")[0]));
await p.waitForTimeout(1500); console.log(await p.evaluate(() => window.SkillBridge.debug.drawer()));
await b.close();
