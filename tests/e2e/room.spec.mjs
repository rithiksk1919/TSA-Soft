// The 3D library room: home screen, Learn and Practice played inside the room, at several sizes.
import { test, expect } from "@playwright/test";
import { watch, settle } from "./helpers.mjs";

test.setTimeout(240_000);   // these walk every book and drawer at one size per test

const SIZES = { laptop: { width: 1360, height: 860 }, wide: { width: 2560, height: 1300 }, phone: { width: 390, height: 844 } };

const roomState = (page) => page.evaluate(() => window.SkillBridge.room.state());
async function waitRoom(page, want, timeout = 8000) {
  await page.waitForFunction((w) => window.SkillBridge.room.state() === w, want, { timeout }).catch(async (e) => {
    throw new Error(`room state stayed "${await roomState(page)}" (wanted "${want}")`);
  });
  await settle(page);
}
async function home(page, size) {
  await page.setViewportSize(size);
  await page.goto("/");
  await page.waitForFunction(() => window.SkillBridge && window.SkillBridge.room && document.querySelectorAll(".dslot").length === 6);
  await settle(page);
}

for (const [name, size] of Object.entries(SIZES)) {
  test.describe(`library room (${name})`, () => {

    test("loads as home with three stations and no console problems", async ({ page }) => {
      const problems = watch(page);
      await home(page, size);
      await expect(page.locator("#room")).toBeVisible();
      await expect(page.locator(".rnav__btn")).toHaveCount(3);
      expect(await roomState(page)).toBe("overview");
      // The room fills the screen: the back wall is drawn across the middle of the view.
      const hit = await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.3); return e && e.className; });
      expect(hit).toBeTruthy();
      expect(problems).toEqual([]);
    });

    test("Learn: every book opens from the room's shelf and goes back; Esc flies out", async ({ page }) => {
      const problems = watch(page);
      await home(page, size);
      await page.locator('.rnav__btn[data-station="learn"]').click();
      await waitRoom(page, "learn");
      await expect(page.locator(".station-back")).toBeVisible();
      for (const id of ["physics", "chemistry", "biology"]) {
        await page.locator(`.rbooks__btn[data-book="${id}"]`).click();
        await page.waitForFunction(() => document.getElementById("reader").classList.contains("is-open"), null, { timeout: 8000 });
        await settle(page);
        await expect(page.locator("#reader")).toHaveClass(/over-room/);
        await expect(page.locator(".eyebrow")).toHaveText(id[0].toUpperCase() + id.slice(1));
        await expect(page.locator("#where-title")).toBeFocused();
        // Ends flat, and the stage handed back its transform.
        expect(await page.evaluate(() => getComputedStyle(document.getElementById("stage")).transform)).toBe("none");
        await page.keyboard.press("Escape");
        await waitRoom(page, "learn");
        await expect(page.locator(`.rbooks__btn[data-book="${id}"]`)).toBeFocused();
        // The room book is visible again and home in its slot.
        const back = await page.evaluate((id) => { const b = document.querySelector(`[data-book="${id}"]`); return { vis: b.style.visibility, home: b.style.transform === b.dataset.base || /translate3d\(0px, -?0(\.0+)?px, 0(\.0+)?px\) rotateY\(-?0(\.0+)?deg\)$/.test(b.style.transform) }; }, id);
        expect(back.vis).toBe("");
        expect(back.home).toBe(true);
      }
      await page.keyboard.press("Escape");
      await waitRoom(page, "overview");
      await expect(page.locator('.rnav__btn[data-station="learn"]')).toBeFocused();
      expect(problems).toEqual([]);
    });

    test("Practice: the cabinet takes the catalog's place; every drawer opens and closes in the room", async ({ page }) => {
      const problems = watch(page);
      await home(page, size);
      await page.locator('.rnav__btn[data-station="practice"]').click();
      await waitRoom(page, "practice");
      const flat = await page.evaluate(() => document.documentElement.classList.contains("sb-flat"));
      if (!flat) {
        // Aligned: the working cabinet's front sits on the room catalog's front.
        const m = await page.evaluate(() => {
          const body = document.querySelector(".station3--catalog .cat-body");
          body.style.visibility = "visible";
          const t = document.querySelector(".station3--catalog .cabinet3 .f3--front").getBoundingClientRect();
          body.style.visibility = "";
          const a = document.getElementById("cab-front").getBoundingClientRect();
          return { dx: Math.abs((t.left + t.width / 2) - (a.left + a.width / 2)), dy: Math.abs((t.top + t.height / 2) - (a.top + a.height / 2)), ratio: a.width / t.width, aw: a.width, vw: innerWidth };
        });
        expect(m.dx).toBeLessThan(8);
        expect(m.dy).toBeLessThan(12);
        expect(Math.abs(m.ratio - 1)).toBeLessThan(0.06);
        expect(m.aw).toBeLessThan(m.vw * 0.75);
      }
      for (const id of ["flashcards", "index", "worked", "diagnostic", "history", "learned"]) {
        await page.locator(`.dslot[data-id="${id}"] .drawer`).click();
        await settle(page);
        expect(await page.evaluate(() => window.SkillBridge.debug.drawer())).not.toBe("closed");
        if (id === "flashcards" && !flat) {
          // The fan stays on screen.
          const out = await page.evaluate(() => [...document.querySelectorAll("#dcontents .fcard:not(.fcard--filler), #dcontents .fdivider")].map((n) => n.getBoundingClientRect())
            .filter((r) => r.left < -4 || r.right > innerWidth + 4 || r.top < -4).length);
          expect(out).toBe(0);
          // The cards stand on the cabinet top: each divider's bottom edge meets the cornice, and the
          // cabinet itself has not moved off its stand.
          const onTop = await page.evaluate(() => {
            const top = document.querySelector(".cab__cornice").getBoundingClientRect().top;
            return [...document.querySelectorAll("#dcontents .fdivider")].map((n) => Math.abs(n.getBoundingClientRect().bottom - top));
          });
          for (const d of onTop) expect(d).toBeLessThan(14);
          // A real click on a divider (Chrome's elementsFromPoint misorders this 3D stack, so not locator.click).
          const box = await page.locator("#dcontents .fdivider").first().boundingBox();
          await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.6);
          await settle(page);
          expect(await page.evaluate(() => window.SkillBridge.debug.drawer())).toBe("subject");
          const sub = await page.evaluate(() => [...document.querySelectorAll('#dcontents .fcard[data-subject="physics"]:not(.fcard--filler)')].map((n) => n.getBoundingClientRect())
            .filter((r) => r.left < 0 || r.right > innerWidth || r.top < 0).length);
          expect(sub).toBe(0);
        }
        // Escape steps back one level at a time (a chosen subject, then the drawer).
        for (let k = 0; k < 3 && (await page.evaluate(() => window.SkillBridge.debug.drawer())) !== "closed"; k++) {
          await page.keyboard.press("Escape");
          await settle(page);
        }
        expect(await page.evaluate(() => window.SkillBridge.debug.drawer())).toBe("closed");
      }
      await page.keyboard.press("Escape");
      await waitRoom(page, "overview");
      expect(await page.evaluate(() => document.documentElement.classList.contains("room-practice"))).toBe(false);
      expect(await page.evaluate(() => { const s = document.getElementById("cab-scene").style; return s.left + s.top + s.perspective; })).toBe("");
      expect(problems).toEqual([]);
    });
  });
}

test("Back to the Library button works from both stations; the room stays consistent", async ({ page }) => {
  await home(page, SIZES.laptop);
  for (const st of ["learn", "practice"]) {
    await page.locator(`.rnav__btn[data-station="${st}"]`).click();
    await waitRoom(page, st);
    await page.locator(".station-back").click();
    await waitRoom(page, "overview");
    await expect(page.locator(".station-back")).toBeHidden();
  }
});

test("a drawer open blocks leaving; closing it first then Back works", async ({ page }) => {
  await home(page, SIZES.laptop);
  await page.locator('.rnav__btn[data-station="practice"]').click();
  await waitRoom(page, "practice");
  await page.locator('.dslot[data-id="history"] .drawer').click();
  await settle(page);
  await page.locator(".station-back").click({ force: true }).catch(() => {});
  await settle(page);
  expect(await roomState(page)).toBe("practice");
  await page.keyboard.press("Escape"); await settle(page);
  await page.keyboard.press("Escape");
  await waitRoom(page, "overview");
});

test("test-only deep links #test-shelf and #test-practice skip the room; Library brings it back", async ({ page }) => {
  await page.setViewportSize(SIZES.laptop);
  await page.goto("/#test-practice");
  await page.waitForFunction(() => window.SkillBridge.debug && window.SkillBridge.debug.scene() === 1);
  await settle(page);
  await expect(page.locator("#room")).toBeHidden();
  await page.locator('.dslot[data-id="worked"] .drawer').click();
  await settle(page);
  expect(await page.evaluate(() => window.SkillBridge.debug.panel())).toBe("worked");
  await page.keyboard.press("Escape"); await settle(page);
  await page.locator("#to-room").click();
  await waitRoom(page, "overview");
  await expect(page.locator("#room")).toBeVisible();
});

test("deep links #practice, #shelf and #book-<id> fly into the room's stations, never the flat scenes", async ({ page }) => {
  await page.setViewportSize(SIZES.laptop);
  await page.goto("/#practice");
  await waitRoom(page, "practice");
  await expect(page.locator("html")).toHaveClass(/room-practice/);
  await expect(page.locator("#h-b")).toBeHidden();
  expect(new URL(page.url()).hash).toBe("");

  await page.goto("about:blank");
  await page.goto("/#shelf");
  await waitRoom(page, "learn");
  await expect(page.locator("#room")).toBeVisible();
  await expect(page.locator(".station-back")).toBeVisible();

  await page.goto("about:blank");
  await page.goto("/#book-chemistry");
  await page.waitForFunction(() => document.getElementById("reader").classList.contains("is-open"), null, { timeout: 8000 });
  await page.keyboard.press("Escape");
  await waitRoom(page, "learn");
});

test("reduced motion: stations open without flights and still work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await home(page, SIZES.laptop);
  await page.locator('.rnav__btn[data-station="learn"]').click();
  await waitRoom(page, "learn");
  await page.locator('.rbooks__btn[data-book="biology"]').click();
  await page.waitForFunction(() => document.getElementById("reader").classList.contains("is-open"), null, { timeout: 5000 });
  await page.keyboard.press("Escape");
  await waitRoom(page, "learn");
  await page.keyboard.press("Escape");
  await waitRoom(page, "overview");
});
