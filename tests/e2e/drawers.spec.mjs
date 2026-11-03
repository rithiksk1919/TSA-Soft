// The five new drawers: contents, filters, details, cross-drawer actions, state, keyboard.
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { gotoApp, settle, toCabinet, openDrawer, watch, WIDTHS } from "./helpers.mjs";

const J = (f) => JSON.parse(readFileSync("static/library/data/" + f, "utf8"));
const CARDS = J("cards.json"), EXTRA = J("mistakes.json").mistakes, WORKED = J("worked.json").examples;
const QS = J("diagnostic.json").questions, HISTORY = J("history.json").attempts;
const ID = { flashcards: 0, index: 1, worked: 2, diagnostic: 3, history: 4, learned: 5 };

const panelId = (page) => page.evaluate(() => window.SkillBridge.debug.panel());
const body = (page) => page.locator("#sheet .sheet__body");

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await page.evaluate(() => { localStorage.removeItem("sb_diagnostic"); window.SkillBridge.store.resetReview(); });
  await toCabinet(page);
});

test("label cards show live counts from data", async ({ page }) => {
  const meta = async (id) => (await page.locator(`.dslot[data-id="${id}"] .drawer__meta`).textContent()).trim();
  expect(await meta("flashcards")).toBe("12 cards");
  expect(await meta("index")).toBe("6 mistakes");
  expect(await meta("worked")).toBe("6 examples");
  expect(await meta("diagnostic")).toBe("15 questions");
  expect(await meta("history")).toBe("12 attempts");
  expect(await meta("learned")).toBe("0 cards");
  // No drawer is disabled any more, and none shows the stuck tooltip.
  await expect(page.locator('.drawer[aria-disabled="true"]')).toHaveCount(0);
  await expect(page.locator(".dtip")).toHaveCount(0);
});

test("every drawer: opens with focus on its title, Esc closes, focus returns, aria-expanded follows", async ({ page }) => {
  const problems = watch(page);
  for (const [id, i] of Object.entries(ID)) {
    if (id === "flashcards") continue;
    const btn = page.locator(`.dslot[data-i="${i}"] .drawer`);
    await btn.click();
    await settle(page);
    expect(await panelId(page)).toBe(id);
    await expect(btn).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#sheet-title")).toBeFocused();
    // Focus is trapped in the panel.
    for (let k = 0; k < 6; k++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.getElementById("sheet").contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Escape");
    await settle(page);
    expect(await panelId(page)).toBe(null);
    await expect(btn).toBeFocused();
    await expect(btn).toHaveAttribute("aria-expanded", "false");
  }
  expect(problems).toEqual([]);
});

test("Mistakes index: dividers, frequency sort and recency sort, detail with wrong vs right", async ({ page }) => {
  await openDrawer(page, ID.index);
  await expect(body(page).locator(".icard")).toHaveCount(6);
  const order = async () => body(page).locator(".icard .icard__call").allTextContents();
  const bySubject = (mode) => ["physics", "chemistry", "biology"].flatMap((s) => CARDS.mistakes.filter((m) => m.subject === s)
    .map((m) => ({ ...m, ...EXTRA[m.id] }))
    .sort((a, b) => mode === "recent" ? (a.lastSeenDays - b.lastSeenDays) || (b.timesMade - a.timesMade) : (b.timesMade - a.timesMade) || (a.lastSeenDays - b.lastSeenDays))
    .map((m) => m.callNumber));
  expect(await order()).toEqual(bySubject("frequent"));
  await body(page).locator('.seg-mini__btn[data-value="recent"]').click();
  expect(await order()).toEqual(bySubject("recent"));
  // Frequency bar is relative to the subject's most frequent mistake.
  const w = await body(page).locator('.icard[data-id="phy-sign"] .fbar > span').evaluate((n) => n.style.width);
  expect(w).toBe("60%");   // 3 of 5
  await body(page).locator('.panel-tools .chip-btn[data-subject="biology"]').click();
  await expect(body(page).locator(".icard")).toHaveCount(2);
  await body(page).locator('.icard[data-id="bio-mrna"]').click();
  await expect(body(page).locator(".detail__title")).toHaveText("Skipping the mRNA step");
  await expect(body(page).locator(".ex--wrong .ex__label")).toContainText("Wrong");
  await expect(body(page).locator(".ex--right .ex__body")).toHaveText(EXTRA["bio-mrna"].rightExample);
  await page.keyboard.press("Escape");   // back to the list, not closed
  await settle(page);
  expect(await panelId(page)).toBe("index");
  await expect(body(page).locator('.icard[data-id="bio-mrna"]')).toBeFocused();
});

test("Mistakes index: Review these cards opens Flashcards on that mistake's cards", async ({ page }) => {
  await openDrawer(page, ID.index);
  await body(page).locator('.icard[data-id="chem-ratio"]').click();
  await body(page).locator("[data-review]").click();
  await settle(page);
  expect(await page.evaluate(() => window.SkillBridge.debug.drawerId())).toBe("flashcards");
  expect(await page.evaluate(() => window.SkillBridge.review.isOpen())).toBe(true);
  await expect(page.locator("#review-title")).toHaveText("Mole ratio from the equation · 2 cards");
});

test("Mistakes index: Open the book goes to the shelf and opens that subject's book", async ({ page }) => {
  await openDrawer(page, ID.index);
  await body(page).locator('.icard[data-id="phy-sign"]').click();
  await body(page).locator("[data-book]").click();
  await settle(page);
  await expect(page.locator("#reader")).toHaveClass(/is-open/);
  await expect(page.locator(".eyebrow")).toHaveText("Physics");
  expect(await page.evaluate(() => window.SkillBridge.debug.scene())).toBe(0);
});

test("Worked examples: steps reveal one at a time (button and Right arrow), mistake step marked, check verified", async ({ page }) => {
  await openDrawer(page, ID.worked);
  await expect(body(page).locator(".icard")).toHaveCount(6);
  for (const e of WORKED) {
    await body(page).locator(`.icard[data-id="${e.id}"]`).click();
    await expect(body(page).locator(".step")).toHaveCount(1);
    for (let k = 1; k < e.steps.length; k++) {
      if (k % 2) await body(page).locator("[data-next]").click();
      else { await body(page).locator(".detail__title").focus(); await page.keyboard.press("ArrowRight"); }
      await expect(body(page).locator(".step")).toHaveCount(k + 1);
    }
    const mi = e.steps.findIndex((s) => s.mistake);
    await expect(body(page).locator(".step.is-mistake")).toHaveCount(1);
    await expect(body(page).locator(".step").nth(mi).locator(".step__flag")).toHaveText("Common mistake here");
    await expect(body(page).locator("[data-next]")).toHaveCount(0);
    // Check yourself: one wrong pick shows "Not quite", for the first example; the rest answer right.
    const pick = e === WORKED[0] ? (e.check.answer + 1) % e.check.options.length : e.check.answer;
    await body(page).locator(`.check .ropt[data-k="${pick}"]`).click();
    await expect(body(page).locator("[data-result]")).toContainText(pick === e.check.answer ? "Correct" : "Not quite");
    await page.keyboard.press("Escape");
    await settle(page);
  }
});

test("Diagnostic: 5 questions per subject, results only at the end, mastery by the formula, saved, retake", async ({ page }) => {
  await openDrawer(page, ID.diagnostic);
  for (const s of ["physics", "chemistry", "biology"]) {
    await body(page).locator(`.dg-subject[data-subject="${s}"]`).click();
    const qs = QS.filter((q) => q.subject === s);
    const answers = [];
    for (let i = 0; i < qs.length; i++) {
      await expect(body(page).locator(".dg-progress")).toHaveText(`Question ${i + 1} of 5`);
      await expect(body(page).locator(".rresult")).toHaveCount(0);   // no feedback before the end
      const right = i % 2 === 0;                                        // right, wrong, right, wrong, right
      const k = right ? qs[i].answer : (qs[i].answer + 1) % qs[i].options.length;
      answers.push({ skill: qs[i].skill, difficulty: qs[i].difficulty, correct: right });
      await body(page).locator(`.ropt[data-k="${k}"]`).click();
    }
    await expect(body(page).locator(".detail__title")).toHaveText("3 of 5 correct");
    const expected = await page.evaluate((a) => window.SBLogic.diagnosticMastery(a), answers);
    for (const [skill, r] of Object.entries(expected)) {
      const row = body(page).locator(".lrow", { hasText: skill });
      await expect(row.locator(".lrow__value")).toHaveText(r.mastery.toFixed(2));
    }
    const weakest = await page.evaluate((e) => window.SBLogic.weakestSkill(e), expected);
    await expect(body(page).locator(".callout")).toContainText(weakest);
    const saved = await page.evaluate((s) => JSON.parse(localStorage.getItem("sb_diagnostic")).results[s], s);
    expect(saved.answers.length).toBe(5);
    await body(page).locator("[data-retake]").click();
    await expect(body(page).locator(".dg-progress")).toHaveText("Question 1 of 5");
    await page.keyboard.press("Escape");   // back to the subject list
    await settle(page);
  }
  await expect(body(page).locator(".dg-subject .icard__meta").first()).toContainText("Last taken");
});

test("History: summary strip, filters, month dividers, outcome scores, action timeline", async ({ page }) => {
  await openDrawer(page, ID.history);
  const stat = async (i) => (await body(page).locator(".stats dd").nth(i).textContent()).trim();
  expect([await stat(0), await stat(1), await stat(2), await stat(3)]).toEqual(["12", "75%", "1.08", "4"]);
  await expect(body(page).locator(".icard")).toHaveCount(12);
  await expect(body(page).locator(".divider-row--month .divider-row__tab")).toHaveText(["October 2026", "September 2026", "August 2026"]);
  await expect(body(page).locator('.icard[data-id="att-04"] .hscore')).toHaveText("o = 0.40");   // the 0.4 floor
  await expect(body(page).locator('.icard[data-id="att-01"] .hscore')).toHaveText("o = 0.65");
  await body(page).locator('.seg-mini__btn[data-value="unsolved"]').click();
  await expect(body(page).locator(".icard")).toHaveCount(3);
  expect(await stat(1)).toBe("0%");
  await body(page).locator('.panel-tools .chip-btn[data-subject="physics"]').click();
  await expect(body(page).locator(".icard")).toHaveCount(2);
  await body(page).locator('.seg-mini__btn[data-value="all"]').click();
  await expect(body(page).locator(".icard")).toHaveCount(HISTORY.filter((a) => a.subject === "physics").length);
  await body(page).locator('.icard[data-id="att-01"]').click();
  await expect(body(page).locator(".timeline__row")).toHaveCount(HISTORY[0].actions.length);
  await expect(body(page).locator(".timeline__row").first()).toContainText("00:08");
});

test("Learned: empty state, then cards learned in Flashcards appear; Move back updates counts everywhere; stamp presses once", async ({ page }) => {
  await openDrawer(page, ID.learned);
  await expect(body(page).locator(".empty")).toHaveText("No cards learned yet. Answer a card correctly twice to move it here.");
  await expect(body(page).locator(".mskill")).toHaveCount(2);
  await expect(body(page).locator(".mskill__name")).toHaveText(["Periodic trends", "Cell structure"]);
  await expect(body(page).locator(".stamp").first()).toHaveText("Verified · transfer passed");
  const stamped = await page.evaluate(() => Object.keys(window.SkillBridge.store.review.stamped || {}));
  expect(stamped.length).toBe(2);
  await page.keyboard.press("Escape"); await settle(page);
  // Learn two cards through the store, the single source of truth.
  await page.evaluate(() => { const s = window.SkillBridge.store; ["phy-normal-1", "bio-mrna-2"].forEach((id) => { s.answer(id, true); s.answer(id, true); }); });
  await expect(page.locator('.dslot[data-id="learned"] .drawer__meta')).toHaveText("2 cards");
  await openDrawer(page, ID.learned);
  await expect(body(page).locator(".icard")).toHaveCount(2);
  // The stamp does not press again on a second view.
  const pressed = await page.evaluate(() => [...document.querySelectorAll("#sheet .stamp")].map((s) => s.style.opacity));
  expect(pressed.every((o) => o === "")).toBe(true);
  await body(page).locator('.icard[data-id="phy-normal-1"]').click();
  await body(page).locator("[data-move]").click();
  await expect(body(page).locator(".icard")).toHaveCount(1);
  await expect(page.locator('.dslot[data-id="learned"] .drawer__meta')).toHaveText("1 card");
  expect(await page.evaluate(() => window.SkillBridge.store.box("phy-normal-1"))).toBe(2);
  await page.keyboard.press("Escape"); await settle(page);
  // Flashcards trays reflect the move.
  await openDrawer(page, ID.flashcards);
  await expect(page.locator("#drawer-trays")).toContainText("1 Learned");
  await expect(page.locator("#drawer-trays")).toContainText("1 Learning");
});

test("persisted state survives a reload: boxes, diagnostic, stamps", async ({ page }) => {
  await page.evaluate(() => { const s = window.SkillBridge.store; s.answer("chem-molar-1", true); s.answer("chem-molar-1", true); s.saveDiagnostic("physics", [{ skill: "Kinematics", difficulty: 0.5, correct: true }]); });
  await page.reload();
  await gotoApp(page);
  expect(await page.evaluate(() => window.SkillBridge.store.box("chem-molar-1"))).toBe(3);
  expect(await page.evaluate(() => Object.keys(window.SkillBridge.store.diagnostic.results))).toEqual(["physics"]);
  await expect(page.locator('.dslot[data-id="learned"] .drawer__meta')).toHaveText("1 card");
});

test("storage blocked: the page still works in memory", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  const problems = watch(page);
  await gotoApp(page);
  await page.evaluate(() => window.SkillBridge.store.answer("phy-sign-1", true));
  expect(await page.evaluate(() => window.SkillBridge.store.box("phy-sign-1"))).toBe(2);
  expect(await page.evaluate(() => window.SkillBridge.store.persistent())).toBe(false);
  expect(problems).toEqual([]);
});

test.describe("390px sheets", () => {
  test.use({ viewport: WIDTHS.phone });
  test("every drawer opens as a bottom sheet and closes with its button", async ({ page }) => {
    await gotoApp(page);
    await page.locator("#seg-practice").click();
    await settle(page);
    for (const [id, i] of Object.entries(ID)) {
      await page.locator(`.dslot[data-i="${i}"] .drawer`).click();
      await settle(page);
      expect(await panelId(page)).toBe(id);
      const box = await page.locator("#sheet").boundingBox();
      expect(Math.round(box.y + box.height)).toBe(844);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator(".sheet__close").click();
      await settle(page);
      expect(await panelId(page)).toBe(null);
    }
  });
});
