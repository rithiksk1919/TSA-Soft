// Screenshots of every state, at 390, 820 and 1360px, into qa/screens/.
import { test } from "@playwright/test";
import { gotoApp, settle, toCabinet, openDrawer, shot, WIDTHS } from "./helpers.mjs";

for (const [name, size] of Object.entries(WIDTHS)) {
  test.describe(`screens ${name}`, () => {
    test.use({ viewport: size });

    test("shelf and book", async ({ page }) => {
      await gotoApp(page);
      await shot(page, "01-shelf");
      await page.locator('.book[data-id="physics"]').click();
      await settle(page);
      await shot(page, "02-book-physics");
      await page.keyboard.press("Escape");
      await settle(page);
    });

    test("cabinet and drawers", async ({ page }) => {
      await gotoApp(page);
      await toCabinet(page);
      await shot(page, "03-cabinet");
      for (const [i, id] of [[0, "flashcards"], [1, "index"], [2, "worked"], [3, "diagnostic"], [4, "history"], [5, "learned"]]) {
        const enabled = await page.locator(`.dslot[data-i="${i}"] .drawer`).getAttribute("aria-disabled");
        if (enabled === "true") continue;
        await openDrawer(page, i);
        await shot(page, `04-drawer-${id}`);
        if (id === "flashcards") {
          const flat = await page.evaluate(() => document.documentElement.classList.contains("sb-flat"));
          await page.locator(flat ? "#sheet [data-review-all]" : "#review-all").click();
          await settle(page);
          await shot(page, "05-review-front");
          await page.locator(".rcard__front .ropt").first().click();
          await settle(page);
          await shot(page, "05-review-back");
          await page.keyboard.press("Escape");
          await settle(page);
        }
        await page.keyboard.press("Escape");
        await settle(page);
        // Leave any nested view with repeated Esc until the drawer is closed.
        for (let k = 0; k < 4 && (await page.evaluate(() => window.SkillBridge.debug.drawer())) !== "closed"; k++) {
          await page.keyboard.press("Escape");
          await settle(page);
        }
      }
    });
  });
}
