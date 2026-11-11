// The reading desk (Apply): room hand-off, the full find-the-wrong-step flow, the mock tutor,
// persistence, the 3D light, flat mode, and accessibility.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { watch, WIDTHS } from "./helpers.mjs";

const choose = async (page, text) => {
  const c = page.locator(".tchoice:not([disabled])", { hasText: text });
  await c.waitFor({ timeout: 20000 });
  await c.click();
};
const judge = async (page, n, v) => {
  const b = page.locator(`.dk-card:nth-child(${n}) .dk-card__judge button[data-v="${v}"]`);
  await b.waitFor({ state: "visible", timeout: 20000 });
  await b.click();
};
const dbg = (page) => page.evaluate(() => window.SkillBridge.desk.debug());

async function openDesk(page, opts = {}) {
  if (opts.size) await page.setViewportSize(opts.size);
  await page.goto("/#desk");
  await page.evaluate(() => localStorage.removeItem("sb_desk"));
  await page.reload();
  await page.locator(".tchoice").first().waitFor({ timeout: 20000 });
}

// The physics scenario with one wrong pick, two misjudged steps and one hint.
async function playPhysics(page) {
  await choose(page, "The normal force on the block");
  await expect(page.locator(".tchoice", { hasText: "The normal force on the block" })).toBeDisabled();
  await choose(page, "acceleration down the slope");
  await judge(page, 1, "ok");
  await judge(page, 2, "wrong");   // step 2 is fine: a miss; the tutor explains and marks it as holding up
  await judge(page, 3, "ok");      // step 3 is the wrong one: a miss; judged again
  await page.click("#tutor-hint");
  await judge(page, 3, "wrong");
  await expect(page.locator(".dk-card:nth-child(3)")).toHaveAttribute("data-state", "wrong");
  await expect(page.locator(".dk-card:nth-child(3) .dk-ring")).toHaveCount(1);
  await choose(page, "mg cos θ, the part");
  await choose(page, "N = mg cos 30° = 19.6");
}

test.describe("reading desk", () => {
  test.use({ reducedMotion: "reduce" });

  test("full scenario: read, check, fix, reflect; progress saved; next scenario", async ({ page }) => {
    const problems = watch(page);
    await openDesk(page);
    expect(await dbg(page)).toMatchObject({ id: "phy-incline-forces", phase: "read" });
    await expect(page.locator(".desk__phase").first()).toHaveAttribute("aria-current", "step");
    await playPhysics(page);
    await page.locator(".tchoice", { hasText: "Next scenario" }).waitFor({ timeout: 20000 });

    // The wrong card was rewritten, the rest redone, the answer corrected, the rule dealt.
    const s3 = page.locator(".dk-card:nth-child(3)");
    await expect(s3).toHaveAttribute("data-state", "fixed");
    await expect(s3.locator(".dk-card__text")).toContainText("mg cos 30°");
    await expect(s3.locator(".dk-card__was")).toContainText("N = mg = 2.0");
    await expect(page.locator('.dk-card[data-state="after"]')).toHaveCount(2);
    await expect(page.locator(".dk-ans__row--yours dd")).toHaveText("a ≈ 3.2 m/s²");
    await expect(page.locator(".dk-ans__row--theirs")).toHaveClass(/is-struck/);
    await expect(page.locator(".dk-stamp")).toHaveText("Applied");
    await expect(page.locator(".dk-card--rule .dk-card__stats")).toHaveText("1 hint · 3 misses");

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("sb_desk")));
    expect(saved.done["phy-incline-forces"]).toMatchObject({ hints: 1, misses: 3 });
    await expect(page.locator('#desk-tabs [data-id="phy-incline-forces"]')).toContainText("(done)");

    await choose(page, "Next scenario");
    await expect.poll(() => dbg(page)).toMatchObject({ id: "chem-grams-moles-grams", phase: "read" });
    await expect(page.locator(".dk-card")).toHaveCount(0);
    await expect(page.locator(".dk-paper__title")).toHaveText("Grams to moles to grams");
    expect(problems).toEqual([]);
  });

  test("chemistry and biology: the fix rewrites the sketch", async ({ page }) => {
    await openDesk(page);
    await page.click('#desk-tabs [data-id="chem-grams-moles-grams"]');
    await choose(page, "The mass of water produced");
    for (const n of [1, 2]) await judge(page, n, "ok");
    await judge(page, 3, "wrong");
    await choose(page, "It divided by molar mass");
    await choose(page, "0.50 mol × 18.02 g/mol");
    await expect(page.locator('.dk-fig [data-parts="D"] text')).toHaveText("9.0 g H₂O");
    await expect(page.locator('.dk-fig [data-parts="CD"] text')).toHaveText("× 18.02 g/mol");

    await choose(page, "Next scenario: Biology");
    await choose(page, "The amino acid sequence");
    for (const n of [1, 2]) await judge(page, n, "ok");
    await judge(page, 3, "wrong");
    await choose(page, "UAA is a stop codon: the ribosome");
    await choose(page, "UAA is a stop codon, so translation ends");
    await expect(page.locator('.dk-fig [data-parts="c4 aa"] text')).toHaveText("Stop");
    await expect(page.locator('.dk-fig [data-parts="c5 aa"]')).toHaveClass(/is-void/);
    await expect(page.locator(".dk-ans__row--yours dd")).toHaveText("Met–Phe–Gly");
  });

  test("the mock tutor answers free questions, refuses to spoil, and runs out of hints", async ({ page }) => {
    await openDesk(page);
    await page.fill("#tutor-input", "what does friction mean here?");
    await page.press("#tutor-input", "Enter");
    await expect(page.locator(".tmsg--me").last()).toHaveText("what does friction mean here?");
    await expect(page.locator(".tmsg--tutor", { hasText: "f = μN" })).toHaveCount(1);
    await page.fill("#tutor-input", "just tell me the answer");
    await page.click(".tutor__compose [type=submit]");
    await expect(page.locator(".tmsg--tutor", { hasText: "rather not hand you the answer" })).toHaveCount(1);
    await expect(page.locator(".tmsg--hint")).toHaveCount(1);
    await expect(page.locator("#tutor-hint")).toHaveText("Hint (1 left)");
    await page.click("#tutor-hint");
    await expect(page.locator("#tutor-hint")).toHaveText("Hint");
    await page.click("#tutor-hint");
    await expect(page.locator(".tmsg--tutor", { hasText: "last hint for this part" })).toHaveCount(1);
    await page.fill("#tutor-input", "qwerty");
    await page.press("#tutor-input", "Enter");
    await expect(page.locator(".tmsg--tutor", { hasText: "scripted demo tutor" })).toHaveCount(1);
    expect((await dbg(page)).hints).toBe(2);
  });

  test("Esc and Library leave the desk for the room; #desk deep-links in", async ({ page }) => {
    await openDesk(page);
    await expect(page.locator("#desk")).toBeVisible();
    await expect(page.locator("#room")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#desk")).toBeHidden();
    await expect(page.locator("#room")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.SkillBridge.room.state())).toBe("overview");
    expect(new URL(page.url()).hash).toBe("");
    // Back in through the room's Apply station, out through the Library button.
    await page.click('.rnav__btn[data-station="apply"]');
    await expect(page.locator("#desk")).toBeVisible();
    await expect(page.locator("#desk-title")).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.getElementById("room").hidden)).toBe(true);
    expect(new URL(page.url()).hash).toBe("#desk");
    await page.click("#desk-close");
    await expect(page.locator("#desk")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.SkillBridge.room.state())).toBe("overview");
  });

  test("axe: no WCAG A/AA violations on the desk, mid-question and judging a step", async ({ page }) => {
    await openDesk(page);
    const run = async (label) => (await new AxeBuilder({ page }).include("#desk").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze())
      .violations.map((v) => `${label}: ${v.id} x${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    const v = await run("question");
    await choose(page, "acceleration down the slope");
    await page.locator(".dk-card__judge button").first().waitFor();
    v.push(...await run("judging"));
    expect(v).toEqual([]);
  });

  test("keyboard only: focus starts on the title; then choices and judge buttons take focus as they appear", async ({ page }) => {
    await openDesk(page);
    await expect(page.locator("#desk-title")).toBeFocused();   // the tutor never pulls focus off the title
    for (let i = 0; i < 20; i++) {
      if (await page.evaluate(() => document.activeElement.classList.contains("tchoice"))) break;
      await page.keyboard.press("Tab");
    }
    await expect(page.locator(".tchoice").first()).toBeFocused();
    await page.keyboard.press("Enter");                       // A: the right answer
    await expect(page.locator('.dk-card:nth-child(1) [data-v="ok"]')).toBeFocused({ timeout: 20000 });
    await page.keyboard.press("Enter");
    await expect(page.locator(".dk-card:nth-child(1)")).toHaveAttribute("data-state", "ok");
  });
});

test.describe("reading desk, 3D and narrow", () => {
  test("3D: the camera sits down and the lamp light follows the step being discussed", async ({ page }) => {
    const problems = watch(page);
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("sb_desk"));
    await expect.poll(() => page.evaluate(() => window.SkillBridge.room.state())).toBe("overview");  // the room ignores clicks until then
    await page.click('.rnav__btn[data-station="apply"]');
    await page.locator(".tchoice").first().waitFor({ timeout: 20000 });
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("dk-cam")).transform)).toMatch(/^matrix3d/);
    await page.locator(".tchoice", { hasText: "acceleration" }).click();
    await page.locator('.dk-card:nth-child(1) [data-v="ok"]').waitFor({ state: "visible", timeout: 20000 });
    await expect(page.locator(".dk-card:nth-child(1)")).toHaveClass(/is-lit/);
    // The light comes to rest centred on the lit card, in tabletop coordinates.
    await expect.poll(() => page.evaluate(() => {
      const spot = document.getElementById("dk-spot"), card = document.querySelector(".dk-card.is-lit"), top = document.getElementById("dk-top");
      const m = new DOMMatrixReadOnly(getComputedStyle(spot).transform);
      let x = card.offsetWidth / 2, y = card.offsetHeight / 2;
      for (let n = card; n && n !== top; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
      return Math.round(Math.hypot(m.m41 + 1100 - x, m.m42 + 1100 - y));
    }), { timeout: 6000 }).toBeLessThan(4);
    expect(problems).toEqual([]);
  });

  test("390px: flat desk, tutor docked at the bottom, no sideways scroll", async ({ page }) => {
    await openDesk(page, { size: WIDTHS.phone });
    const s = await page.evaluate(() => ({
      cam: getComputedStyle(document.getElementById("dk-cam")).transform,
      pos: getComputedStyle(document.getElementById("tutor")).position,
      overflow: document.getElementById("desk").scrollWidth - document.getElementById("desk").clientWidth,
      props: getComputedStyle(document.querySelector(".dk-props")).display
    }));
    expect(s).toEqual({ cam: "none", pos: "fixed", overflow: 0, props: "none" });
    await choose(page, "acceleration down the slope");
    await judge(page, 1, "ok");
    await expect(page.locator(".dk-card:nth-child(1)")).toHaveAttribute("data-state", "ok");
  });
});
