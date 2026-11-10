// Deterministic room renders: pins the camera to every pose (overview with pointer-look extremes, each
// station, mid-flight points) with the clock hidden, and saves qa/poses/<tag>-<n>.png. Prints the face count.
// usage: node qa/probes/probe-room-poses.mjs <tag>
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const tag = process.argv[2] || "now"; mkdirSync("qa/poses", { recursive: true });
const b = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.addStyleTag({ content: ".clock > span { visibility: hidden !important } *{transition:none!important}" });
const base = await p.evaluate(() => document.getElementById("cam3").style.transform);
console.log(tag, "faces", await p.evaluate(() => document.querySelectorAll("#world3 .f3, #world3 .p3").length));
const P = /translateZ\(([\d.]+)px\)/.exec(base)[1], sh = /translateY\((-?[\d.]+)px\)/.exec(base)[1];
const POSES = { overview: [0, -560, 1260, 0, -14], learn: [-560, -430, -150, 0, -4], apply: [40, -560, 40, 0, -46], practice: [560, -290, -150, 0, -8] };
const tf = (x, y, z, yaw, pitch, s) => `translateY(${s}px) translateZ(${P}px) rotateX(${pitch}deg) rotateY(${yaw}deg) translate3d(${-x}px,${-y}px,${-z}px)`;
const mix = (a, c, k) => a.map((v, i) => v + (c[i] - v) * k);
const cases = { overview: [...POSES.overview, sh] };
for (const [n, dy, dp] of [["look-tl", -3, 1.5], ["look-tr", 3, 1.5], ["look-bl", -3, -1.5], ["look-br", 3, -1.5]]) { const o = POSES.overview; cases[n] = [o[0], o[1], o[2], dy, o[4] + dp, sh]; }
for (const s of ["learn", "apply", "practice"]) { cases[s] = [...POSES[s], 0]; for (const k of [0.33, 0.66]) cases[`fly-${s}-${k}`] = [...mix(POSES.overview, POSES[s], k), sh * (1 - k)]; }
for (const [n, c] of Object.entries(cases)) {
  await p.evaluate(t => { document.getElementById("cam3").style.transform = t; }, tf(...c));
  await p.waitForTimeout(250); await p.screenshot({ path: `qa/poses/${tag}-${n}.png` });
}
console.log(Object.keys(cases).join(" "));
await b.close();
