// Schematic renderer + virtual multimeter. The circuit's fault is never sent to the browser;
// every reading comes from the server's solver.
import { esc } from "./ui.js";

const U = 120, PAD = 60;

export function fmtValue(c) {
  if (c.type === "battery") return `${c.value} V`;
  if (c.type === "wire") return "";
  return c.value >= 1000 ? `${+(c.value / 1000).toFixed(2)} kΩ` : `${c.value} Ω`;
}

function compSvg(c, p1, p2, state) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const at = (t, off = 0) => [mid[0] + ux * t + nx * off, mid[1] + uy * t + ny * off];
  const sel = state.selected === c.id ? "sel" : "";
  let body = "", leads;
  const stroke = 'stroke="#e8e8e8" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
  if (c.type === "wire") {
    leads = `<line class="lead" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" ${stroke}/>`;
  } else if (c.type === "resistor") {
    const half = 26, a = at(-half), b = at(half);
    leads = `<line class="lead" x1="${p1[0]}" y1="${p1[1]}" x2="${a[0]}" y2="${a[1]}" ${stroke}/><line class="lead" x1="${b[0]}" y1="${b[1]}" x2="${p2[0]}" y2="${p2[1]}" ${stroke}/>`;
    const pts = [a];
    for (let k = 0; k < 6; k++) pts.push(at(-half + (k + 0.5) * (2 * half / 6), k % 2 ? -8 : 8));
    pts.push(b);
    body = `<polyline class="body" points="${pts.map((p) => p.join(",")).join(" ")}" ${stroke}/>`;
  } else {
    // battery: a = + terminal (long plate), b = - terminal (short plate)
    const g = 6, la = at(-g), lb = at(g);
    const long1 = at(-g, 16), long2 = at(-g, -16), sh1 = at(g, 8), sh2 = at(g, -8);
    leads = `<line class="lead" x1="${p1[0]}" y1="${p1[1]}" x2="${la[0]}" y2="${la[1]}" ${stroke}/><line class="lead" x1="${lb[0]}" y1="${lb[1]}" x2="${p2[0]}" y2="${p2[1]}" ${stroke}/>`;
    body = `<line class="body" x1="${long1[0]}" y1="${long1[1]}" x2="${long2[0]}" y2="${long2[1]}" ${stroke}/><line class="body" x1="${sh1[0]}" y1="${sh1[1]}" x2="${sh2[0]}" y2="${sh2[1]}" stroke="#e8e8e8" stroke-width="4" stroke-linecap="round"/>`;
    const plus = at(-g - 12, 18);
    body += `<text x="${plus[0]}" y="${plus[1] + 4}" font-size="12" fill="#bbb" text-anchor="middle">+</text>`;
  }
  const horiz = Math.abs(dy) < 1;
  const labelPos = horiz ? [mid[0], mid[1] - 20] : [mid[0] + (c.type === "battery" ? 26 : 22), mid[1] + 4];
  const anchor = horiz ? "middle" : "start";
  const label = c.type === "wire"
    ? `<text x="${horiz ? mid[0] : mid[0] + 10}" y="${horiz ? mid[1] + 16 : mid[1] + 4}" font-size="10" fill="#777" text-anchor="${horiz ? "middle" : "start"}">${c.id}</text>`
    : `<text x="${labelPos[0]}" y="${labelPos[1]}" font-size="12" fill="#f2f2f2" text-anchor="${anchor}" font-weight="600">${c.id}<tspan fill="#aaa" font-weight="400" dx="6">${esc(fmtValue(c))}</tspan></text>`;
  return `<g class="comp ${sel}" data-comp="${c.id}"><line class="hit" x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0]}" y2="${p2[1]}" stroke="transparent" stroke-width="22" stroke-linecap="round"/>${leads}${body}${label}</g>`;
}

export function schematic(circuit, state) {
  const pts = Object.values(circuit.nodes);
  const maxX = Math.max(...pts.map((p) => p[0])), maxY = Math.max(...pts.map((p) => p[1]));
  const pos = (n) => [PAD + circuit.nodes[n][0] * U, PAD + circuit.nodes[n][1] * U];
  const W = PAD * 2 + maxX * U, H = PAD * 2 + maxY * U;
  const comps = circuit.components.map((c) => compSvg(c, pos(c.a), pos(c.b), state)).join("");
  const nodes = Object.keys(circuit.nodes).map((n) => {
    const [x, y] = pos(n);
    const cls = state.red === n ? "red" : state.black === n ? "black" : "";
    const gnd = n === circuit.ground ? `<text x="${x}" y="${y + 26}" font-size="10" fill="#888" text-anchor="middle">GND</text>` : "";
    return `<g class="node ${cls}" data-node="${n}"><circle class="ring" cx="${x}" cy="${y}" r="13" fill="transparent" stroke="transparent" stroke-width="1.5"/><circle class="dot" cx="${x}" cy="${y}" r="5"/><text x="${x - 10}" y="${y - 10}" font-size="11" fill="#9ad" text-anchor="end">${n}</text>${gnd}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Circuit schematic">${comps}${nodes}</svg>`;
}

export const MODE_INFO = {
  voltage: { label: "V", name: "Voltage", help: "Click a node for the red probe, then a node for the black probe." },
  current: { label: "mA", name: "Current", help: "Click a component to put the meter in series with it." },
  resistance: { label: "Ω", name: "Resistance", help: "Click a component. It is measured isolated, with the power off." },
};
