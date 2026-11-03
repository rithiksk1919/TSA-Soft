// Regression: a drawer stays visible for its whole open and close.
// Each animation frame we record the face's box, opacity/visibility/display, and whether the
// face is actually what is painted at its own centre (a hidden-behind-the-cabinet face still
// has a box, so the box alone cannot catch the flicker).
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { gotoApp, toCabinet, settle } from "./helpers.mjs";

async function installSampler(page) {
  await page.evaluate(() => {
    window.__sample = (i, ms) => new Promise((resolve) => {
      const btn = document.querySelector(`.dslot[data-i="${i}"] .drawer`);
      const slot = btn.parentElement;
      const out = [];
      const t0 = performance.now();
      function frame() {
        const r = btn.getBoundingClientRect();
        const cs = getComputedStyle(btn);
        // Sample a point on the lower part of the face, below the label holder.
        const x = r.left + r.width * 0.15, y = r.top + r.height * 0.9;
        const hit = document.elementFromPoint(x, y);
        const sheet = document.querySelector(".sheet.is-open");
        const zm = (slot.style.transform || "").match(/,\s*([-\d.]+)px\)/);
        out.push({
          t: Math.round(performance.now() - t0),
          x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height),
          opacity: +cs.opacity, visibility: cs.visibility, display: cs.display,
          // While a panel is open the scene is inert (focus trap), and elementFromPoint skips inert
          // content; the hit test cannot speak then, so only the depth/box/opacity checks apply.
          painted: (!!hit && (slot.contains(hit) || (!!sheet && sheet.contains(hit)))) || !!slot.closest("[inert]"),
          z: zm ? +zm[1] : null,
          hit: hit ? (hit.id || hit.className || hit.tagName) : null
        });
        if (performance.now() - t0 < ms) requestAnimationFrame(frame); else resolve(out);
      }
      requestAnimationFrame(frame);
    });
  });
}

function check(frames, label) {
  const problems = [];
  frames.forEach((f, k) => {
    if (f.opacity !== 1 || f.visibility !== "visible" || f.display === "none") problems.push(`${label} frame ${k} t=${f.t}: opacity ${f.opacity} ${f.visibility} ${f.display}`);
    if (!f.painted) problems.push(`${label} frame ${k} t=${f.t}: face not painted (top element: ${f.hit})`);
    // The face rests 1px in front of the cabinet front. Below that it is behind the front: hidden.
    if (f.z !== null && f.z < 1) problems.push(`${label} frame ${k} t=${f.t}: drawer depth ${f.z}px is behind the cabinet front`);
    if (k > 0) {
      const p = frames[k - 1];
      const jump = Math.hypot(f.x - p.x, f.y - p.y);
      if (jump > 80) problems.push(`${label} frame ${k} t=${f.t}: jumped ${Math.round(jump)}px`);
    }
  });
  return problems;
}

function save(name, data) {
  mkdirSync("qa/traces", { recursive: true });
  writeFileSync(`qa/traces/${name}.json`, JSON.stringify(data, null, 1));
}

test.describe("drawer flicker regression (desktop 3D)", () => {
  for (const [i, id] of [[0, "flashcards"], [1, "index"], [2, "worked"], [3, "diagnostic"], [4, "history"], [5, "learned"]]) {
    test(`${id}: open then close, drawer face visible every frame`, async ({ page }) => {
      await gotoApp(page);
      await toCabinet(page);
      await installSampler(page);
      const opening = page.evaluate((i) => window.__sample(i, 2600), i);
      await page.locator(`.dslot[data-i="${i}"] .drawer`).click();
      const openFrames = await opening;
      await settle(page);
      const closing = page.evaluate((i) => window.__sample(i, 3000), i);
      await page.keyboard.press("Escape");
      const closeFrames = await closing;
      if (i === 0) { save("flicker-open", openFrames); save("flicker-close", closeFrames); }
      const problems = [...check(openFrames, "open"), ...check(closeFrames, "close")];
      expect(problems.slice(0, 12), problems.length + " problems").toEqual([]);
      await settle(page);
      await expect(page.locator(`.dslot[data-i="${i}"] .drawer`)).toBeFocused();
    });
  }

  test("rapid open / close / open, and Esc during the open", async ({ page }) => {
    await gotoApp(page);
    await toCabinet(page);
    await installSampler(page);
    const frames = page.evaluate(() => window.__sample(0, 5200));
    const btn = page.locator('.dslot[data-i="0"] .drawer');
    await btn.click();
    await page.waitForTimeout(180);
    await page.keyboard.press("Escape");           // Esc while the drawer is still sliding out
    await page.waitForTimeout(250);
    await btn.click({ force: true });               // open again while it may still be closing
    await page.waitForTimeout(160);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(140);
    await btn.click({ force: true });
    const all = await frames;
    save("flicker-rapid", all);
    expect(check(all, "rapid").slice(0, 12)).toEqual([]);
    await settle(page);
    // Whatever the sequence, it ends in a consistent state with the drawer at rest.
    const st = await page.evaluate(() => window.SkillBridge.debug.drawer());
    expect(["groups", "closed"]).toContain(st);
  });
});
