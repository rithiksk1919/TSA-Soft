// Shared helpers for the SkillBridge e2e tests.
import { expect } from "@playwright/test";

export const WIDTHS = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1000 }, desktop: { width: 1360, height: 860 } };

// Collect console errors/warnings and failed requests for a page.
export function watch(page) {
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
  return problems;
}

export async function gotoApp(page, opts = {}) {
  if (opts.size) await page.setViewportSize(opts.size);
  // #test-shelf deep-links past the library room to the shelf scene (the room has its own spec).
  // From a page already on #test-shelf that would be a same-document hash change, not a load (init
  // scripts would not run), so leave the page first.
  if (page.url().startsWith("http")) await page.goto("about:blank");
  await page.goto("/" + (opts.query || "") + (opts.room ? "" : "#test-shelf"));
  await page.waitForFunction(() => document.querySelectorAll(".book").length === 3 && document.querySelectorAll(".dslot").length === 6);
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

// Wait until no spring is running and no Web Animation is in flight.
// Quiet = no spring running, no finite Web Animation running, and no drawer mid-sequence.
// It must stay quiet across two checks 300ms apart (sequences pause between motions).
export async function settle(page, timeout = 10000) {
  const quiet = () => page.waitForFunction(() => {
    const sb = window.SkillBridge;
    const springs = sb && sb.activeSprings ? sb.activeSprings() : 0;
    const anims = document.getAnimations().filter((a) => a.playState === "running" && a.effect && a.effect.getTiming().iterations !== Infinity).length;
    const st = sb && sb.debug ? sb.debug.drawer() : "closed";
    return springs === 0 && anims === 0 && st !== "opening" && st !== "closing";
  }, null, { timeout });
  for (let i = 0; i < 2; i++) { await quiet(); await page.waitForTimeout(300); }
  await quiet();
}

export const state = (page) => page.evaluate(() => {
  const sb = window.SkillBridge;
  return {
    scene: sb.debug.scene(),
    p: sb.debug.p(),
    drawer: sb.debug.drawer(),
    panel: sb.debug.panel ? sb.debug.panel() : null,
    focusId: document.activeElement && (document.activeElement.id || document.activeElement.className),
    live: document.getElementById("announcer").textContent,
    aInert: document.getElementById("scene-a").inert,
    bInert: document.getElementById("scene-b").inert,
    aVis: getComputedStyle(document.getElementById("scene-a")).visibility,
    bVis: getComputedStyle(document.getElementById("scene-b")).visibility
  };
});

export async function toCabinet(page) {
  await page.locator("#to-cabinet, #seg-practice").filter({ visible: true }).first().click();
  await settle(page);
  expect((await state(page)).scene).toBe(1);
}

export async function toShelf(page) {
  await page.locator("#to-shelf, #seg-learn").filter({ visible: true }).first().click();
  await settle(page);
  expect((await state(page)).scene).toBe(0);
}

export const drawerButton = (page, i) => page.locator(`.dslot[data-i="${i}"] .drawer`);

export async function openDrawer(page, i) {
  await drawerButton(page, i).click();
  await settle(page);
}

export async function closeDrawer(page) {
  await page.keyboard.press("Escape");
  await settle(page);
}

export async function shot(page, name) {
  const w = page.viewportSize().width;
  await page.screenshot({ path: `qa/screens/${name}-${w}.png` });
}
