// Shared UI helpers: icons, formatting, modal, toast.

const P = {
  power: '<path d="M12 3v8"/><path d="M6.6 6.6a8 8 0 1 0 10.8 0"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  courses: '<path d="M2 8.5 12 4l10 4.5-10 4.5z"/><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
  chart: '<path d="M3 20h18"/><path d="M5 16l4-5 4 3 6-8"/><path d="M15 6h4v4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  badge: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4 19.5h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  headset: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>', chevUp: '<path d="m6 15 6-6 6 6"/>', chevRight: '<path d="m9 6 6 6-6 6"/>', chevLeft: '<path d="m15 6-6 6 6 6"/>',
  updown: '<path d="m8 9 4-4 4 4"/><path d="m16 15-4 4-4-4"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>', arrowLeft: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>', arrowUpRight: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>', zap: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  zip: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M10 6h1M10 9h1M10 12h1"/><rect x="9" y="14" width="3" height="3" rx=".5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m20.5 16-5-5-9 8.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.2-2.4 3.7"/><path d="M12 17h.01"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5 .8 1.2 1.5 1.8 2.5 2C11 7.5 11 5.5 12 3z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  bookmark: '<path d="M6.5 3.5h11v17l-5.5-4-5.5 4z"/>', list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 21l5-2.5 5 2.5-1.5-7.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', filter: '<path d="M4 6h16M7 12h10M10 18h4"/>', sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>', grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
  meter: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><rect x="8" y="6" width="8" height="4" rx="1"/><circle cx="12" cy="15.5" r="2.5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
};
const DOMAIN_ICON = { python: "code", circuits: "zap" };
const SKILL_ICON = { py_conditionals: "flag", py_loops: "refresh", py_off_by_one: "sliders", py_returns: "arrowUpRight", py_scope: "layers", py_types: "grid",
  ck_ohms: "meter", ck_series: "list", ck_parallel: "layers", ck_open: "x", ck_short: "zap", ck_value: "target" };

export function icon(name, cls = "") {
  return `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.help}</svg>`;
}
export const domainIcon = (d, cls) => icon(DOMAIN_ICON[d] || "book", cls);
export const skillIcon = (s, cls) => icon(SKILL_ICON[s] || "target", cls);

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
export const initials = (name) => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
export function bar(x, cls = "") {
  return `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(1, x || 0)) * 100}%"></span></div>`;
}
export function fmtDate(ts) {
  if (!ts) return "–";
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
export function relTime(ts) {
  if (!ts) return "";
  const s = Date.now() / 1000 - ts;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hour${s >= 7200 ? "s" : ""} ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} day${s >= 172800 ? "s" : ""} ago`;
  return fmtDate(ts);
}
export function dur(sec) {
  if (sec == null) return "–";
  sec = Math.round(sec);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  return m < 60 ? `${m}m ${sec % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`;
}
export const diffLabel = (d) => (d < 0.35 ? "Intro" : d < 0.6 ? "Core" : d < 0.8 ? "Stretch" : "Challenge");
export const statusTag = (s) => ({
  solved: '<span class="tag dark">Solved</span>', failed: '<span class="tag">Not solved</span>', active: '<span class="tag">In progress</span>',
  new: '<span class="tag">Not started</span>', abandoned: '<span class="tag">Left</span>',
}[s] || `<span class="tag">${esc(s)}</span>`);
export const modeLabel = (m) => ({ normal: "Adaptive pick", remedial: "Remedial", scaffolded: "Scaffolded", transfer: "Transfer check", review: "Review", free_choice: "Your choice" }[m] || m || "");

export function toast(msg, ms = 2600) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function modal(html, { dismissable = true, onMount } = {}) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => back.remove();
  if (dismissable) {
    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  }
  back.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));
  document.body.appendChild(back);
  onMount && onMount(back.querySelector(".modal"), close);
  return close;
}

export function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span>${label ? " " + label : ""}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

export function reasonList(reasons) {
  return (reasons || []).map((r) => `<div class="reason">${esc(r)}</div>`).join("");
}
