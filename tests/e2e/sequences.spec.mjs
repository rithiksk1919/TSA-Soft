// Sequences across drawers and scenes: the page always ends in one consistent state.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, toCabinet, openDrawer } from "./helpers.mjs";

const st = (page) => page.evaluate(() => {
  const sb = window.SkillBridge;
  return {
    scene: sb.debug.scene(), drawer: sb.debug.drawer(), drawerId: sb.debug.drawerId(), panel: sb.debug.panel(), review: sb.debug.review(),
    expanded: [...document.querySelectorAll(".dslot .drawer")].filter((b) => b.getAttribute("aria-expanded") === "true").length,
    sheetHidden: document.getElementById("sheet").hidden,
    // No drawer is left part-way out once everything has settled.
    outDrawers: [...document.querySelectorAll(".dslot")].filter((s) => { const m = (s.style.transform || "").match(/,\s*([-\d.]+)px\)/); return m && +m[1] > 12; }).map((s) => s.dataset.id)
  };
});

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => window.SkillBridge.store.resetReview());
  await toCabinet(page);
});

test("open A, close, open B immediately: B opens, A is home", async ({ page }) => {
  await page.locator('.dslot[data-id="index"] .drawer').click();
  await settle(page);
  await page.keyboard.press("Escape");                 // A closes
  await page.waitForFunction(() => window.SkillBridge.debug.drawer() === "closed");
  await page.locator('.dslot[data-id="history"] .drawer').click();   // B, the moment A is home
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "panel", drawerId: "history", panel: "history", expanded: 1, outDrawers: ["history"] });
  await page.keyboard.press("Escape");
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "closed", drawerId: null, panel: null, expanded: 0, sheetHidden: true, outDrawers: [] });
  await expect(page.locator('.dslot[data-id="history"] .drawer')).toBeFocused();
});

test("open the fan drawer, close, open a panel drawer right away (and back)", async ({ page }) => {
  await page.locator('.dslot[data-id="flashcards"] .drawer').click();
  await settle(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  await page.locator('.dslot[data-id="learned"] .drawer').click({ force: true });
  await settle(page);
  expect(await st(page)).toMatchObject({ drawerId: "learned", panel: "learned", expanded: 1, outDrawers: ["learned"] });
  await page.locator(".sheet__close").click();
  await page.waitForTimeout(60);
  await page.locator('.dslot[data-id="flashcards"] .drawer').click({ force: true });
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "groups", drawerId: "flashcards", panel: null, expanded: 1, outDrawers: ["flashcards"] });
});

test("Esc mid-animation, for every drawer: always lands closed and home", async ({ page }) => {
  for (const id of ["flashcards", "index", "worked", "diagnostic", "history", "learned"]) {
    for (const delay of [60, 220, 520]) {
      await page.locator(`.dslot[data-id="${id}"] .drawer`).click();
      await page.waitForTimeout(delay);
      await page.keyboard.press("Escape");
      await settle(page);
      // A panel drawer that had already opened needs one Esc per level; there are none at the top.
      for (let k = 0; k < 2 && (await st(page)).drawer !== "closed"; k++) { await page.keyboard.press("Escape"); await settle(page); }
      expect(await st(page), `${id} after ${delay}ms`).toMatchObject({ drawer: "closed", panel: null, review: false, expanded: 0, sheetHidden: true, outDrawers: [] });
    }
  }
});

test("a panel drawer re-opened mid-close comes back with its contents", async ({ page }) => {
  await page.locator('.dslot[data-id="history"] .drawer').click();
  await settle(page);
  await page.locator('#sheet .icard[data-id="att-03"]').click();
  await page.keyboard.press("Escape");                 // detail -> list
  await page.keyboard.press("Escape");                 // start closing
  await page.waitForTimeout(150);
  await page.locator('.dslot[data-id="history"] .drawer').click({ force: true });
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "panel", panel: "history", expanded: 1, sheetHidden: false });
  await expect(page.locator("#sheet .icard")).toHaveCount(12);
  await page.keyboard.press("Escape"); await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "closed", panel: null, outDrawers: [] });
});

test("Esc while the drawer is closing re-closes nothing twice; clicking it again re-opens from where it is", async ({ page }) => {
  const btn = page.locator('.dslot[data-id="worked"] .drawer');
  await btn.click(); await settle(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(60);
  await page.keyboard.press("Escape");                 // second Esc during the close: ignored
  await page.waitForTimeout(200);
  await btn.click({ force: true });                    // re-open mid-close
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "panel", panel: "worked", expanded: 1 });
});

test("with a drawer open, the scene arrow is out of reach; after closing it works", async ({ page }) => {
  await openDrawer(page, 2);
  expect(await page.locator("#to-shelf").evaluate((b) => b.inert || !!b.closest("[inert]"))).toBe(true);
  await page.locator("#to-shelf").click({ force: true, timeout: 2000 }).catch(() => {});
  await settle(page);
  expect(await st(page)).toMatchObject({ scene: 1, panel: "worked" });
  await page.keyboard.press("Escape"); await settle(page);
  await page.locator("#to-shelf").click();
  await settle(page);
  expect((await st(page)).scene).toBe(0);
});

test("pressing the arrow while a drawer is opening does not move the camera", async ({ page }) => {
  await page.locator('.dslot[data-id="history"] .drawer').click();
  await page.waitForTimeout(50);
  await page.evaluate(() => document.getElementById("to-shelf").click());   // even a scripted click
  await settle(page);
  expect(await st(page)).toMatchObject({ scene: 1, panel: "history" });
});

test("a review open inside a drawer: Close Drawer exits the review first, then closes", async ({ page }) => {
  await openDrawer(page, 0);
  await page.locator("#review-all").click();
  await settle(page);
  await page.evaluate(() => window.SkillBridge.closeDrawer());
  await settle(page);
  expect(await st(page)).toMatchObject({ drawer: "closed", review: false, expanded: 0, outDrawers: [] });
});

test("reload: persisted boxes and diagnostic come back, and the counts agree everywhere", async ({ page }) => {
  await openDrawer(page, 0);
  await page.locator("#review-all").click();
  await settle(page);
  // Answer the first two cards correctly.
  for (let i = 0; i < 2; i++) {
    const prompt = (await page.locator(".rcard__front .rcard__text").textContent()).trim();
    const k = await page.evaluate((p) => window.SkillBridge.store.cards().find((c) => c.prompt === p).answer, prompt);
    await page.locator(`.rcard__front .ropt[data-k="${k}"]`).click();
    await page.locator(".rbtn--primary").click();
    await settle(page);
  }
  await page.keyboard.press("Escape"); await settle(page);
  await page.keyboard.press("Escape"); await settle(page);
  await page.reload();
  await gotoApp(page);
  await toCabinet(page);
  await openDrawer(page, 0);
  await expect(page.locator("#drawer-trays")).toContainText("10 To review");
  await expect(page.locator("#drawer-trays")).toContainText("2 Learning");
});
