// Mastery-over-time line chart: one shared y-axis (0-100%), 2px lines, legend,
// hover crosshair + tooltip, and a table view (relief for low-contrast slots).
import { esc } from "./ui.js";

// Validated categorical order (fixed, never cycled). Colour follows the skill, not its rank.
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];

export function masteryChart(el, { skills, series, events }) {
  // skills: [{id, name}] (<= 6, fixed order) ; events: [{label}] ; series: {skillId: [value per event]}
  const W = 720, H = 260, L = 40, R = 16, T = 14, B = 30;
  const n = events.length;
  const x = (i) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - v) * (H - T - B);
  const color = Object.fromEntries(skills.map((s, i) => [s.id, SERIES[i]]));
  const hidden = new Set();
  let tableView = false;

  function draw() {
    if (tableView) {
      el.querySelector(".chart-body").innerHTML = `<div style="overflow:auto"><table class="tbl"><thead><tr><th>Step</th>${skills.map((s) => `<th>${esc(s.name)}</th>`).join("")}</tr></thead><tbody>${
        events.map((e, i) => `<tr><td>${esc(e.label)}</td>${skills.map((s) => `<td>${series[s.id][i] == null ? "–" : Math.round(series[s.id][i] * 100) + "%"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      return;
    }
    const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ececec"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#8a8a8a">${v * 100}%</text>`).join("");
    const threshold = `<line x1="${L}" x2="${W - R}" y1="${y(0.8)}" y2="${y(0.8)}" stroke="#9a9a9a" stroke-dasharray="3 4"/><text x="${W - R}" y="${y(0.8) - 5}" text-anchor="end" font-size="10" fill="#6b6b6b">mastery 80%</text>`;
    const lines = skills.filter((s) => !hidden.has(s.id)).map((s) => {
      const pts = series[s.id].map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${color[s.id]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join("");
    const ticks = events.map((e, i) => (n <= 12 || i % Math.ceil(n / 12) === 0) ? `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="10" fill="#8a8a8a">${i === 0 ? "Start" : i}</text>` : "").join("");
    el.querySelector(".chart-body").innerHTML = `
      <div class="chart-wrap" style="position:relative">
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mastery over time by skill">
          ${grid}${threshold}${ticks}${lines}
          <line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#121212" stroke-width="1" opacity="0"/>
          <g class="dots"></g>
          <rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/>
        </svg>
        <div class="tip hidden" style="position:absolute;top:8px;background:#fff;border:1px solid #e2e2e2;border-radius:8px;padding:8px 10px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.08);pointer-events:none;min-width:160px"></div>
      </div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), xh = el.querySelector(".xh"), dots = el.querySelector(".dots");
    const hit = el.querySelector(".hit");
    const move = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.clientX - r.left) / r.width) * W;
      const i = n <= 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - L) / (W - L - R)) * (n - 1))));
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("opacity", "0.25");
      const vis = skills.filter((s) => !hidden.has(s.id) && series[s.id][i] != null);
      dots.innerHTML = vis.map((s) => `<circle cx="${x(i)}" cy="${y(series[s.id][i])}" r="4" fill="${color[s.id]}" stroke="#fff" stroke-width="2"/>`).join("");
      tip.innerHTML = `<div style="font-weight:500;margin-bottom:4px">${esc(events[i].label)}</div>` +
        vis.sort((a, b) => series[b.id][i] - series[a.id][i]).map((s) => `<div class="row between" style="gap:14px"><span class="row" style="gap:6px"><i style="width:10px;height:2px;background:${color[s.id]};display:inline-block"></i>${esc(s.name)}</span><b style="font-weight:500">${Math.round(series[s.id][i] * 100)}%</b></div>`).join("");
      tip.classList.remove("hidden");
      const left = (x(i) / W) * r.width;
      tip.style.left = `${left > r.width / 2 ? left - tip.offsetWidth - 12 : left + 12}px`;
    };
    hit.addEventListener("mousemove", move);
    hit.addEventListener("mouseleave", () => { tip.classList.add("hidden"); xh.setAttribute("opacity", "0"); dots.innerHTML = ""; });
  }

  el.innerHTML = `
    <div class="row between wrap" style="margin-bottom:10px">
      <div class="legend">${skills.map((s) => `<span data-k="${s.id}"><i style="background:${color[s.id]}"></i>${esc(s.name)}</span>`).join("")}</div>
      <button class="btn sm ghost" data-view>Table view</button>
    </div>
    <div class="chart-body"></div>`;
  el.querySelectorAll(".legend span").forEach((sp) => sp.addEventListener("click", () => {
    hidden.has(sp.dataset.k) ? hidden.delete(sp.dataset.k) : hidden.add(sp.dataset.k);
    sp.classList.toggle("off");
    draw();
  }));
  el.querySelector("[data-view]").addEventListener("click", (e) => { tableView = !tableView; e.target.textContent = tableView ? "Chart view" : "Table view"; draw(); });
  draw();
}

// Build aligned series from mastery_history: one event per diagnostic/episode, values carried forward.
export function buildMasterySeries(history, skillIds, titleFor) {
  const evKeys = [];
  const evIndex = new Map();
  const rows = [];
  for (const sk of skillIds) for (const p of history[sk] || []) rows.push({ sk, ...p });
  rows.sort((a, b) => a.ts - b.ts);
  for (const r of rows) {
    const key = r.source === "diagnostic" ? "diag" : `ep${r.episode_id}`;
    if (!evIndex.has(key)) { evIndex.set(key, evKeys.length); evKeys.push({ key, label: r.source === "diagnostic" ? "Diagnostic" : titleFor(r.episode_id) }); }
  }
  const events = [{ label: "Start (default 30%)" }, ...evKeys];
  const series = {};
  for (const sk of skillIds) {
    const vals = new Array(events.length).fill(null);
    vals[0] = 0.3;
    for (const p of history[sk] || []) vals[evIndex.get(p.source === "diagnostic" ? "diag" : `ep${p.episode_id}`) + 1] = p.m;
    for (let i = 1; i < vals.length; i++) if (vals[i] == null) vals[i] = vals[i - 1];
    series[sk] = vals;
  }
  return { events, series };
}
