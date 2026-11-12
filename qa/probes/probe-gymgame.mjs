// The gym game over the 3D room, with the server's gym answers faked (the demo learners have no skill
// at mastery 0.80): the round screen, a made shot, the scoreboard, and the final screen.
import { chromium } from "@playwright/test";
const W = Number(process.argv[2] || 1600), H = Number(process.argv[3] || 900);
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const round = (i) => ({ kicker: "Round " + (i + 1), title: "Bus fares", story: "Riders aged 65 or over ride free. Find the line with the bug.",
  lines: ["def fare(age):", "    if age > 65:", "        return 0", "    return 2"], shot: null });
const game = { id: 1, skill: "py_conditionals", made: 0, shots_taken: 0, counts_as_transfer: true, rounds: [round(0), round(1), round(2)] };
await page.route(/\/api\/profiles\/\d+\/hub$/, async (r) => {
  const res = await r.fetch(); const j = await res.json();
  j.rooms.gym.ready = [{ skill: "py_conditionals", name: "Conditional logic" }];
  r.fulfill({ response: res, json: j });
});
await page.route(/\/api\/profiles\/\d+\/gym\/start$/, (r) => r.fulfill({ json: game }));
await page.route(/\/api\/gym\/1\/shot$/, (r) => { game.made = 1; game.shots_taken = 1; game.rounds[0].shot = { made: true }; r.fulfill({ json: { made: true, chosen_line: 1, correct_line: 1, explanation: "65 is not greater than 65, so it needs >=.", finished: false, round: 2 } }); });
await page.route(/\/api\/gym\/1$/, (r) => r.fulfill({ json: game }));
await page.goto("http://127.0.0.1:5180/#/gym");
await page.waitForSelector("#gym-stage .sb3__face");
await page.waitForTimeout(700);
await page.screenshot({ path: "qa/school3d/game-intro.png" });
await page.locator("#start-game").click();
await page.waitForSelector(".lines button");
await page.waitForTimeout(500);
await page.screenshot({ path: "qa/school3d/game-round.png" });
await page.locator('.lines button[data-line="1"]').click();
await page.waitForTimeout(1100);
await page.screenshot({ path: "qa/school3d/game-shot.png" });
await page.waitForSelector("#next-round", { timeout: 6000 });
await page.waitForTimeout(300);
await page.screenshot({ path: "qa/school3d/game-after.png" });
const sb = await page.evaluate(() => [...document.querySelectorAll("[data-sb]")].map((n) => n.dataset.sb + "=" + n.textContent).join(" "));
console.log("scoreboard:", sb);
await page.locator("#next-round").click();
await page.waitForTimeout(400);
const ballHome = await page.evaluate(() => document.querySelector(".ball3--player").getAnimations().length === 0);
console.log("ball back on its spot for round 2:", ballHome);
console.log("errors:", errors.length ? errors : "none");
await browser.close();
