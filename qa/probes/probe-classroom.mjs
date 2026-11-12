// The 3D classroom: screenshots of the room and each station, and frame timing during every
// animation (camera flights, chalkboard steps, page turns, the listening meter).
// usage: node qa/probes/probe-classroom.mjs [outPrefix] [width] [height]
import { chromium } from "@playwright/test";

const out = process.argv[2] || "qa/classroom/c";
const W = Number(process.argv[3] || 1600);
const H = Number(process.argv[4] || 900);
const gpu = process.env.GPU === "0" ? [] : ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", ...gpu] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Records frame-to-frame gaps between start() and stop(); a gap over 25 ms at 60 Hz is a missed frame.
await page.addInitScript(() => {
  window.__frames = { on: false, last: 0, gaps: [] };
  function loop(t) {
    const f = window.__frames;
    if (f.on) {
      if (f.last) f.gaps.push(t - f.last);
      f.last = t;
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
});
const startFrames = () => page.evaluate(() => { window.__frames.on = true; window.__frames.last = 0; window.__frames.gaps = []; });
const stopFrames = async (label) => {
  const g = await page.evaluate(() => { window.__frames.on = false; return window.__frames.gaps; });
  const long = g.filter((x) => x > 25);
  const worst = g.length ? Math.max(...g).toFixed(1) : "-";
  const avg = g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(1) : "-";
  console.log(`${label.padEnd(24)} frames ${String(g.length).padStart(3)}  avg ${avg} ms  worst ${worst} ms  missed ${long.length}`);
};

await page.goto("http://127.0.0.1:5180/#/classroom");
await page.waitForSelector(".c3cam .c3board");
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}-room.png` });

async function station(name, shot, inside) {
  await startFrames();
  await page.locator(`.bar [data-station="${name}"]`).click();
  await page.waitForSelector(".panel", { timeout: 5000 });
  await page.waitForTimeout(400);
  await stopFrames(`fly + open ${name}`);
  await page.screenshot({ path: `${out}-${shot}.png` });
  if (inside) await inside();
  await startFrames();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1100);
  await stopFrames(`close + fly back`);
}

await station("watch", "board", async () => {
  for (let i = 0; i < 3; i++) {
    await startFrames();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(160);
    if (i === 0) await page.screenshot({ path: `${out}-board-mid.png` });
    await page.waitForTimeout(500);
    await stopFrames(`chalkboard step ${i + 2}`);
  }
  await page.screenshot({ path: `${out}-board-step4.png` });
  // the highlight sits on the current line
  const ok = await page.evaluate(() => {
    const hl = document.querySelector(".cb-hl").getBoundingClientRect();
    const now = document.querySelector(".cb-code li.is-now");
    if (!now) return "no current line";
    const r = now.getBoundingClientRect();
    return Math.abs(hl.top - r.top) < 2 ? "aligned" : `off by ${(hl.top - r.top).toFixed(1)}px`;
  });
  console.log("highlight:", ok);
});

await station("read", "book", async () => {
  await startFrames();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}-book-flip.png` });
  await page.waitForTimeout(600);
  await stopFrames("page turn");
  await page.screenshot({ path: `${out}-book-2.png` });
  const crisp = await page.evaluate(() => {
    const leaf = document.querySelector(".tb-leaf");
    const t = [...document.querySelectorAll(".tb-page")].map((p) => getComputedStyle(p).transform);
    return { leafGone: !leaf, pageTransforms: [...new Set(t)] };
  });
  console.log("after turn:", JSON.stringify(crisp));
});

await station("listen", "listen", async () => {
  await startFrames();
  await page.locator("#ls-play").click();
  await page.waitForTimeout(2500);
  await stopFrames("listening (playing)");
  await page.screenshot({ path: `${out}-listen-playing.png` });
  const st = await page.evaluate(() => ({
    status: document.querySelector("#ls-status").textContent,
    browser: document.querySelector(".ls").classList.contains("is-browser"),
    bar: document.querySelector(".ls-lines button.is-now .ls-bar")?.style.transform || "",
    meter: document.querySelector("#ls-meter i:nth-child(4)").style.transform
  }));
  console.log("listening:", JSON.stringify(st));
});

console.log("errors:", errors.length ? errors : "none");
await browser.close();
