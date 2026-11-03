// Flashcards drawer: fan, filters, counts, Review N, the Leitner review, end screen, Esc everywhere.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gotoApp, settle, toCabinet, openDrawer, watch } from "./helpers.mjs";

const DATA = JSON.parse(readFileSync("static/library/data/cards.json", "utf8"));
const ALL = DATA.mistakes.flatMap((m) => m.cards.map((c) => ({ ...c, mistake: m })));

// Press a subject chip only if it is not already pressed (pressing the active chip toggles back to All).
async function chooseChip(page, subject) {
  const chip = page.locator(`#subject-buttons .chip-btn[data-subject="${subject}"]`);
  if ((await chip.getAttribute("aria-pressed")) !== "true") { await chip.click(); await settle(page); }
}
const boxes = (page) => page.evaluate(() => ({ ...window.SkillBridge.store.review.boxes }));
const drawerState = (page) => page.evaluate(() => window.SkillBridge.debug.drawer());

async function answer(page, correct) {
  // Read the current card from the page, then pick the right or a wrong option.
  const prompt = (await page.locator(".rcard__front .rcard__text").textContent()).trim();
  const card = ALL.find((c) => c.prompt === prompt);
  expect(card, "card on screen is in the data: " + prompt).toBeTruthy();
  const pick = correct ? card.answer : (card.answer + 1) % card.options.length;
  await page.locator(`.rcard__front .ropt[data-k="${pick}"]`).click();
  await expect(page.locator(".rcard__back .rresult")).toContainText(correct ? "Correct" : "Not quite");
  return card;
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => window.SkillBridge.store.resetReview());
  await toCabinet(page);
});

test("open: cards fan up, label and bar counts match the data", async ({ page }) => {
  const problems = watch(page);
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer__meta')).toHaveText(`${ALL.length} cards`);
  await openDrawer(page, 0);
  expect(await drawerState(page)).toBe("groups");
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#drawer-trays")).toContainText(`${ALL.length} To review`);
  await expect(page.locator("#review-all")).toHaveText(`Review All (${ALL.length})`);
  // Every mistake card has risen out of the drawer (well above its resting depth).
  const risen = await page.evaluate(() => [...document.querySelectorAll("#dcontents .fcard:not(.fcard--filler)")].map((n) => new DOMMatrix(getComputedStyle(n).transform).m42));
  expect(risen.length).toBe(DATA.mistakes.length);
  for (const y of risen) expect(y).toBeLessThan(-100);
  expect(problems).toEqual([]);
});

test("divider tabs and chips filter by subject; counts follow the filter", async ({ page }) => {
  await openDrawer(page, 0);
  for (const s of DATA.subjects) {
    const n = DATA.mistakes.filter((m) => m.subject === s.id).flatMap((m) => m.cards).length;
    await page.locator(`#subject-buttons .chip-btn[data-subject="${s.id}"]`).click();
    await settle(page);
    expect(await drawerState(page)).toBe("subject");
    await expect(page.locator(`#subject-buttons .chip-btn[data-subject="${s.id}"]`)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#review-all")).toHaveText(`Review All ${s.name} (${n})`);
    // Only this subject's mistake cards are reachable.
    const reachable = await page.evaluate(() => [...document.querySelectorAll("#dcontents .fcard:not(.fcard--filler)")].filter((b) => !b.disabled).map((b) => b.dataset.subject));
    expect(reachable.length).toBe(DATA.mistakes.filter((m) => m.subject === s.id).length);
    for (const r of reachable) expect(r).toBe(s.id);
  }
  await page.locator('#subject-buttons .chip-btn[data-subject=""]').click();
  await settle(page);
  expect(await drawerState(page)).toBe("groups");
  // A divider tab in the 3D drawer filters too.
  // Playwright's actionability check does not settle on this 3D-transformed button, though the hit
  // test at its tab finds it; click the tab with a real mouse click at its on-screen position.
  const tab = await page.locator("#dcontents .fdivider").nth(1).locator(".fdivider__tab").boundingBox();
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y).closest(".fdivider"), { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 })).toBe(true);
  await page.mouse.click(tab.x + tab.width / 2, tab.y + tab.height / 2);
  await settle(page);
  await expect(page.locator('#subject-buttons .chip-btn[data-subject="chemistry"]')).toHaveAttribute("aria-pressed", "true");
});

test("Review N cards works for each mistake, and Review All for all of them", async ({ page }) => {
  await openDrawer(page, 0);
  for (const m of DATA.mistakes) {
    await chooseChip(page, m.subject);
    await page.locator("#dcontents .fcard", { hasText: m.call }).click();
    await settle(page);
    await expect(page.locator("#review-title")).toHaveText(`${m.title} · ${m.cards.length} cards`);
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await page.evaluate(() => window.SkillBridge.review.isOpen())).toBe(false);
  }
  await page.locator('#subject-buttons .chip-btn[data-subject=""]').click();
  await settle(page);
  await page.locator("#review-all").click();
  await settle(page);
  await expect(page.locator("#review-title")).toHaveText(`All mistakes · ${ALL.length} cards`);
});

test("all 12 cards: answered correctly, then incorrectly; boxes and end screen add up", async ({ page }) => {
  await openDrawer(page, 0);
  await page.locator("#review-all").click();
  await settle(page);
  for (let i = 0; i < ALL.length; i++) {
    await answer(page, true);
    await expect(page.locator(".rmove")).toHaveText("Moved from To review to Learning.");
    await page.locator(".rbtn--primary").click();
    await settle(page);
  }
  await expect(page.locator("#review-summary")).toHaveText(`${ALL.length} cards reviewed: ${ALL.length} correct, 0 not quite.`);
  expect(Object.values(await boxes(page)).every((b) => b === 2)).toBe(true);
  // Review again, all wrong: everything goes back to To review.
  await page.locator(".rbtn", { hasText: "Review Again" }).click();
  await settle(page);
  for (let i = 0; i < ALL.length; i++) {
    await answer(page, false);
    await expect(page.locator(".rmove")).toHaveText("Moved from Learning to To review.");
    await page.locator(".rbtn--primary").click();
    await settle(page);
  }
  await expect(page.locator("#review-summary")).toHaveText(`${ALL.length} cards reviewed: 0 correct, ${ALL.length} not quite.`);
  expect(Object.values(await boxes(page)).every((b) => b === 1)).toBe(true);
  // Back to drawer
  await page.locator(".rbtn", { hasText: "Back to Drawer" }).click();
  await settle(page);
  expect(await page.evaluate(() => window.SkillBridge.review.isOpen())).toBe(false);
  expect(await drawerState(page)).toBe("groups");
});

test("all 6 Leitner transitions happen in the UI", async ({ page }) => {
  await openDrawer(page, 0);
  const m = DATA.mistakes[0];
  const id = m.cards[0].id;
  const step = async (correct, expectFrom, expectTo) => {
    await page.locator(`#subject-buttons .chip-btn[data-subject="${m.subject}"]`).click();
    await settle(page);
    await page.locator("#dcontents .fcard", { hasText: m.call }).click();
    await settle(page);
    await answer(page, correct);
    expect((await boxes(page))[id]).toBe(expectTo);
    await page.keyboard.press("Escape");
    await settle(page);
    await page.locator('#subject-buttons .chip-btn[data-subject=""]').click();
    await settle(page);
  };
  await step(false, 1, 1);  // 1 wrong  -> 1
  await step(true, 1, 2);   // 1 right  -> 2
  await step(false, 2, 1);  // 2 wrong  -> 1
  await step(true, 1, 2);
  await step(true, 2, 3);   // 2 right  -> 3 (Learned)
  await step(true, 3, 3);   // 3 right  -> 3
  await step(false, 3, 1);  // 3 wrong  -> 1
});

test("Esc at every step walks back one level", async ({ page }) => {
  await openDrawer(page, 0);
  await page.locator('#subject-buttons .chip-btn[data-subject="biology"]').click();
  await settle(page);
  await page.locator("#dcontents .fcard", { hasText: "BIO.PRO.001" }).click();
  await settle(page);
  await answer(page, true);                       // on the back of the card
  await page.keyboard.press("Escape"); await settle(page);
  expect(await page.evaluate(() => window.SkillBridge.review.isOpen())).toBe(false);
  expect(await drawerState(page)).toBe("subject");
  await expect(page.locator("#dcontents .fcard", { hasText: "BIO.PRO.001" })).toBeFocused();
  await page.keyboard.press("Escape"); await settle(page);
  expect(await drawerState(page)).toBe("groups");
  await page.keyboard.press("Escape"); await settle(page);
  expect(await drawerState(page)).toBe("closed");
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer')).toBeFocused();
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer')).toHaveAttribute("aria-expanded", "false");
});

test("review persists in localStorage sb_cards and survives a reload", async ({ page }) => {
  await openDrawer(page, 0);
  await page.locator("#review-all").click();
  await settle(page);
  await answer(page, true);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sb_cards")));
  expect(Object.values(saved.boxes)).toEqual([2]);
  await page.reload();
  await page.waitForFunction(() => window.SkillBridge.store && window.SkillBridge.store.data.cards);
  expect(Object.values(await boxes(page))).toEqual([2]);
});
