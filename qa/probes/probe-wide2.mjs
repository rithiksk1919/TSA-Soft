import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 2560, height: 1300 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1500);
await p.click('.rnav__btn[data-station="practice"]'); await p.waitForTimeout(2600);
console.log(await p.evaluate(() => {
  const out = {};
  document.querySelectorAll(".dslot").forEach((s) => { const r = s.querySelector(".drawer").getBoundingClientRect(); out[s.dataset.id] = [r.left, r.top, r.width, r.height].map(Math.round).join(","); });
  const cs = document.getElementById("cab-scene"); const st = cs.style;
  out.scene = [st.left, st.top, st.perspective, st.perspectiveOrigin].join(" | ");
  out.rig = document.getElementById("cab-rig").style.transform;
  out.active = document.activeElement.className;
  return out;
}));
await p.evaluate(() => document.querySelectorAll(".dslot .drawer").forEach((d) => { const r = d.getBoundingClientRect(); const o = document.createElement("div"); o.style.cssText = `position:fixed;z-index:99;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:3px solid red;pointer-events:none`; document.body.append(o); }));
await p.screenshot({ path: "qa/traces/wide-rects.png" });
await b.close();
