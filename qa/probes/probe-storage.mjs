import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage();
await p.addInitScript(() => { try { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); window.__def = "ok"; } catch (e) { window.__def = "failed: " + e.message; } });
await p.goto("http://127.0.0.1:5180/#shelf"); await p.waitForTimeout(1500);
console.log(await p.evaluate(() => { let t; try { localStorage.getItem("x"); t = "no throw"; } catch (e) { t = "throws"; } return { def: window.__def, access: t, persistent: window.SkillBridge.store.persistent(), boxes: JSON.stringify(window.SkillBridge.store.review) }; }));
await b.close();
