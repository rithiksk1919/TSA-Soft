// Shelf scene: books, logos, the open/zoom sequence, Back and Esc, focus return, data.
import { test, expect } from "@playwright/test";
import { gotoApp, settle, watch } from "./helpers.mjs";

const SUBJECTS = [
  { id: "physics", name: "Physics", avg: "0.56", next: "Find the wrong step: forces on a block on an incline" },
  { id: "chemistry", name: "Chemistry", avg: "0.50", next: "Find the wrong step: grams to moles to grams" },
  { id: "biology", name: "Biology", avg: "0.61", next: "Find the wrong step: from DNA to protein" }
];

test("shelf: no scrollbar, books stand fully on the board, averages come from data", async ({ page }) => {
  await gotoApp(page);
  const m = await page.evaluate(() => {
    const wrap = document.querySelector(".shelf-wrap");
    const board = document.querySelector(".shelf__board-front").getBoundingClientRect();
    const books = [...document.querySelectorAll(".slot:not(.slot--empty)")].map((s) => s.getBoundingClientRect());
    const cs = getComputedStyle(wrap);
    const scrolls = (v) => v === "auto" || v === "scroll";
    return {
      // A scrollbar needs a scroll container; only the under-520px layout scrolls (sideways, by design).
      scrollY: scrolls(cs.overflowY) ? wrap.scrollHeight - wrap.clientHeight : 0,
      scrollX: scrolls(cs.overflowX) ? wrap.scrollWidth - wrap.clientWidth : 0,
      overflowY: cs.overflowY,
      bottoms: books.map((b) => Math.round(b.bottom)),
      tops: books.map((b) => Math.round(b.top)),
      boardTop: Math.round(board.top),
      scores: [...document.querySelectorAll(".spine__score")].map((n) => n.dataset.text)
    };
  });
  expect(m.scrollY).toBeLessThanOrEqual(0);
  expect(m.scrollX).toBeLessThanOrEqual(0);
  expect(["visible", "clip"]).toContain(m.overflowY);
  for (const b of m.bottoms) expect(Math.abs(b - m.boardTop)).toBeLessThanOrEqual(3);   // standing on the board
  for (const t of m.tops) expect(t).toBeGreaterThan(0);                                  // not clipped at the top
  expect(m.scores).toEqual(SUBJECTS.map((s) => s.avg));
});

for (const s of SUBJECTS) {
  test(`book ${s.name}: focus starts the logo, open lands flat with its data, Back and Esc return focus`, async ({ page }) => {
    const problems = watch(page);
    await gotoApp(page);
    const spine = page.locator(`.book[data-id="${s.id}"]`);
    await expect(spine).toHaveAttribute("aria-label", `Open the ${s.name} book`);
    const playState = () => spine.evaluate((b) => [...b.querySelectorAll(".face--spine .logo .a")].map((n) => getComputedStyle(n).animationPlayState));
    expect((await playState()).every((x) => x === "paused")).toBe(true);
    // Reach the spine with Tab (keyboard focus, so :focus-visible applies).
    for (let i = 0; i < 20 && !(await spine.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(spine).toBeFocused();
    expect((await playState()).every((x) => x === "running")).toBe(true);

    // Open with Enter
    await page.keyboard.press("Enter");
    await settle(page);
    await expect(page.locator("#reader")).toHaveClass(/is-open/);
    await expect(spine).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#where-title")).toBeFocused();
    await expect(page.locator("#announcer")).toHaveText(`${s.name} book opened`);
    await expect(page.locator(".eyebrow")).toHaveText(s.name);
    await expect(page.locator(".summary b")).toHaveText(s.avg);
    await expect(page.locator("#next-title")).toHaveText(s.next);
    // Ends flat: no transforms left on the camera, tilt, spread or leaf.
    const transforms = await page.evaluate(() => ["#cam", "#tilt", "#spread", "#leaf"].map((q) => getComputedStyle(document.querySelector(q)).transform));
    expect(transforms).toEqual(["none", "none", "none", "none"]);

    // Close with Esc
    await page.keyboard.press("Escape");
    await settle(page);
    await expect(page.locator("#reader")).not.toHaveClass(/is-open/);
    await expect(spine).toBeFocused();
    await expect(spine).toHaveAttribute("aria-expanded", "false");

    // Open again with a click, close with the Back button
    await spine.click();
    await settle(page);
    await page.locator("#back").click();
    await settle(page);
    await expect(spine).toBeFocused();
    expect(problems).toEqual([]);
  });
}

test("open book traps focus: Tab never leaves the reader", async ({ page }) => {
  await gotoApp(page);
  await page.locator('.book[data-id="physics"]').click();
  await settle(page);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() => document.getElementById("reader").contains(document.activeElement));
    expect(inside).toBe(true);
  }
});
