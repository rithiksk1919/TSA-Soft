import { test, expect } from "@playwright/test";
import { watch, gotoApp, WIDTHS } from "./helpers.mjs";

for (const [name, size] of Object.entries(WIDTHS)) {
  test(`smoke: loads with no console errors or failed requests (${name})`, async ({ page }) => {
    const problems = watch(page);
    await gotoApp(page, { size });
    await expect(page.locator(".book")).toHaveCount(3);
    await expect(page.locator(".dslot")).toHaveCount(6);
    expect(problems).toEqual([]);
  });
}

test("smoke: works offline (only same-origin requests, all served locally)", async ({ page, context }) => {
  const problems = watch(page);
  const external = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "127.0.0.1") { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await gotoApp(page);
  expect(external).toEqual([]);
  expect(problems).toEqual([]);
  // Fonts are the bundled files, really loaded.
  // Check the weights the page renders (an unused weight is never fetched, by design).
  const fonts = await page.evaluate(() => ['400 16px "IBM Plex Sans"', '500 16px "IBM Plex Sans"', '400 12px "IBM Plex Mono"', '600 16px "Source Serif 4"']
    .map((f) => f + ": " + document.fonts.check(f)));
  expect(fonts.every((f) => f.endsWith("true")), fonts.join(", ")).toBe(true);
});
