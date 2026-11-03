import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1360, height: 860 } });
await p.goto("http://127.0.0.1:5180/"); await p.waitForTimeout(1200);
await p.click("#to-cabinet"); await p.waitForTimeout(1900);
await p.click('.dslot[data-i="0"] .drawer'); await p.waitForTimeout(2600);
console.log(await p.evaluate(() => {
  const out = []; let n = document.querySelector("#dcontents .fcard");
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    const bad = [];
    if (cs.opacity !== "1") bad.push("opacity " + cs.opacity);
    if (cs.filter !== "none") bad.push("filter");
    if (cs.overflow !== "visible") bad.push("overflow " + cs.overflow);
    if (cs.clipPath !== "none") bad.push("clip-path");
    if (cs.isolation === "isolate") bad.push("isolation");
    if (cs.mixBlendMode !== "normal") bad.push("blend");
    if (cs.contain !== "none") bad.push("contain " + cs.contain);
    if (cs.willChange !== "auto") bad.push("will-change " + cs.willChange);
    out.push((n.id || n.className.toString().split(" ")[0] || n.tagName) + " [" + cs.transformStyle + "]" + (bad.length ? "  <-- " + bad.join(", ") : ""));
    n = n.parentElement;
  }
  return out.join("\n") + "\nflat class: " + document.documentElement.className;
}));
await b.close();
