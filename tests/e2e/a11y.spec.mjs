// Accessibility: axe-core in each state, a contrast script, keyboard-only paths, focus traps.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoApp, settle, toCabinet, openDrawer, WIDTHS } from "./helpers.mjs";

async function axe(page, label) {
  const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const v = res.violations.map((x) => `${label}: ${x.id} (${x.impact}) x${x.nodes.length}: ${x.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  return v;
}

// WCAG contrast of every visible text element against its first opaque background.
async function contrast(page, scope) {
  return page.evaluate((scopeSel) => {
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
    const bgOf = (el) => {
      for (let n = el; n; n = n.parentElement) {
        const b = rgba(getComputedStyle(n).backgroundColor);
        if (b && b.a > 0.95) return b.c;
      }
      return [244, 242, 238];
    };
    const out = [];
    const root = scopeSel ? document.querySelector(scopeSel) : document.body;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const el = t.parentElement;
      if (!el || seen.has(el) || !t.textContent.trim()) continue;
      seen.add(el);
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      if (el.closest("[aria-hidden='true'], .visually-hidden, [inert]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue;
      // Skip anything under a non-opaque ancestor (mid-fade), it is not a resting state.
      let faded = false;
      for (let n = el; n; n = n.parentElement) if (+getComputedStyle(n).opacity < 1) { faded = true; break; }
      if (faded) continue;
      const cs = getComputedStyle(el);
      const fg = rgba(cs.color).c, bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
      window.__checked = (window.__checked || 0) + 1;
      if (ratio < need) out.push(`${ratio.toFixed(2)} < ${need}: "${t.textContent.trim().slice(0, 40)}" (${el.className || el.tagName})`);
    }
    return out;
  }, scope || null);
}

for (const [name, size] of Object.entries(WIDTHS)) {
  test.describe(`a11y ${name}`, () => {
    test.use({ viewport: size });

    test("axe and contrast: shelf, open book, cabinet, drawer, review", async ({ page }) => {
      await gotoApp(page);
      const problems = [];
      problems.push(...await axe(page, "shelf"), ...await contrast(page));
      await page.locator('.book[data-id="chemistry"]').click();
      await settle(page);
      problems.push(...await axe(page, "book"), ...await contrast(page, "#reader"));
      await page.keyboard.press("Escape");
      await settle(page);
      await toCabinet(page);
      problems.push(...await axe(page, "cabinet"), ...await contrast(page, "#scene-b"));
      await openDrawer(page, 0);
      const flat = await page.evaluate(() => document.documentElement.classList.contains("sb-flat"));
      problems.push(...await axe(page, "flashcards"));
      problems.push(...await contrast(page, flat ? "#sheet" : "#drawer-bar"));
      const review = page.locator(flat ? "#sheet [data-review-all]" : "#review-all");
      await review.click();
      await settle(page);
      problems.push(...await axe(page, "review"), ...await contrast(page, "#review .review__body"));
      await page.locator(".rcard__front .ropt").first().click();
      await settle(page);
      problems.push(...await axe(page, "review-back"), ...await contrast(page, "#review .review__body"));
      expect(problems).toEqual([]);
      // The contrast script really looked: dozens of text elements across the states.
      const checked = await page.evaluate(() => window.__checked);
      console.log(`contrast: ${checked} text elements checked at ${name}`);
      expect(checked).toBeGreaterThan(40);
    });
  });
}

test("keyboard only: shelf -> book -> back -> cabinet -> drawer -> review -> answer -> back out", async ({ page }) => {
  await gotoApp(page);
  const tabTo = async (pred, max = 40) => {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(pred)) return;
      await page.keyboard.press("Tab");
    }
    throw new Error("could not reach target with Tab: " + pred);
  };
  // Every focused element shows a visible focus ring.
  const ring = () => page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) >= 2; });

  await tabTo(() => document.activeElement.matches('.book[data-id="biology"]'));
  expect(await ring()).toBe(true);
  await page.keyboard.press("Enter"); await settle(page);
  await expect(page.locator("#where-title")).toBeFocused();
  await page.keyboard.press("Escape"); await settle(page);
  await expect(page.locator('.book[data-id="biology"]')).toBeFocused();

  await tabTo(() => document.activeElement.id === "to-cabinet");
  expect(await ring()).toBe(true);
  await page.keyboard.press("Enter"); await settle(page);
  await expect(page.locator("#h-b")).toBeFocused();

  await tabTo(() => document.activeElement.matches('.dslot[data-id="flashcards"] .drawer'));
  expect(await ring()).toBe(true);
  await page.keyboard.press("Enter"); await settle(page);
  await expect(page.locator('#subject-buttons .chip-btn').first()).toBeFocused();
  // Focus is trapped in the open drawer: 20 Tabs never leave the drawer and its bar.
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press("Tab");
    const where = await page.evaluate(() => { const a = document.activeElement; return { ok: !!a.closest('.dslot[data-id="flashcards"], #drawer-bar'), what: a.tagName + "." + a.className + "#" + a.id }; });
    expect(where.ok, "Tab " + i + " left the drawer: " + where.what).toBe(true);
  }
  await tabTo(() => document.activeElement.id === "review-all");
  await page.keyboard.press("Enter"); await settle(page);
  await page.keyboard.press("1"); await settle(page);           // answer with the keyboard
  await expect(page.locator(".rcard__back .rresult")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.getElementById("review").contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape"); await settle(page);
  await expect(page.locator("#review-all")).toBeFocused();
  await page.keyboard.press("Escape"); await settle(page);
  await expect(page.locator('.dslot[data-id="flashcards"] .drawer')).toBeFocused();

  await tabTo(() => document.activeElement.id === "to-shelf");
  await page.keyboard.press("Enter"); await settle(page);
  await expect(page.locator("#h-a")).toBeFocused();
});

for (const [name, size] of [["desktop", WIDTHS.desktop], ["phone", WIDTHS.phone]]) {
  test(`axe and contrast in every drawer and its detail view (${name})`, async ({ page }) => {
    test.setTimeout(180_000);   // five drawers, each with its opening motion and a detail view
    await page.setViewportSize(size);
    await gotoApp(page);
    await page.evaluate(() => { const s = window.SkillBridge.store; ["phy-normal-1"].forEach((id) => { s.answer(id, true); s.answer(id, true); }); });
    await toCabinet(page);
    const problems = [];
    for (const [i, id, open] of [[1, "index", ".icard"], [2, "worked", ".icard"], [3, "diagnostic", ".dg-subject"], [4, "history", ".icard"], [5, "learned", ".icard"]]) {
      await openDrawer(page, i);
      problems.push(...await axe(page, id), ...await contrast(page, "#sheet"));
      await page.locator("#sheet " + open).first().click();
      await settle(page);
      if (id === "worked") { for (let k = 0; k < 6 && await page.locator("#sheet [data-next]").count(); k++) await page.locator("#sheet [data-next]").click(); await settle(page); }
      problems.push(...await axe(page, id + "-detail"), ...await contrast(page, "#sheet"));
      for (let k = 0; k < 3 && (await page.evaluate(() => window.SkillBridge.debug.drawer())) !== "closed"; k++) { await page.keyboard.press("Escape"); await settle(page); }
    }
    expect(problems).toEqual([]);
  });
}
