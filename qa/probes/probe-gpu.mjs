import { chromium } from "@playwright/test";
for (const args of [[], ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]]) {
  const b = await chromium.launch({ args });
  const p = await b.newPage();
  console.log(JSON.stringify(args), await p.evaluate(() => { const c = document.createElement("canvas").getContext("webgl"); if (!c) return "no webgl"; const e = c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; }));
  await b.close();
}
