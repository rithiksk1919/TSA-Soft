import { api, session, loadCatalog } from "./api.js";
import { icon, esc, initials, modal, toast } from "./ui.js";
import * as dashboard from "./pages/dashboard.js";
import * as courses from "./pages/courses.js";
import * as lesson from "./pages/lesson.js";
import * as assessments from "./pages/assessments.js";
import * as diagnostic from "./pages/diagnostic.js";
import * as challenges from "./pages/challenges.js";
import * as certification from "./pages/certification.js";
import * as projects from "./pages/projects.js";
import * as downloads from "./pages/downloads.js";
import * as settings from "./pages/settings.js";

const NAV = [
  ["", "Dashboard", "home"], ["courses", "Courses", "courses"], ["lessons", "Lessons", "calendar"],
  ["assessments", "Assessments", "chart"], ["challenges", "Challenges", "trophy"], ["certification", "Certification", "badge"],
  ["projects", "Projects", "folder"], ["downloads", "Downloads", "download"],
];
const PAGES = { "": dashboard, courses, lessons: lesson, assessments, diagnostic, challenges, certification, projects, downloads, settings };

function shell() {
  document.getElementById("app").innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <a class="hub-back" href="/#/">← School hub</a>
      <a class="brand" href="#/"><span class="brand-mark">${icon("power")}</span>SkillBridge</a>
      <nav class="nav" id="nav">${NAV.map(([r, label, ic]) => `<a href="#/${r}" data-route="${r}">${icon(ic)}${label}</a>`).join("")}</nav>
      <div class="help-card">
        <h4>${icon("headset", "sm")}Need a hand?</h4>
        <p>Your next breakthrough is one question away.</p>
        <button class="btn sm" id="help-btn">Help center</button>
      </div>
      <div class="side-foot">
        <a class="side-link" href="#/settings">${icon("settings", "sm")}Settings</a>
        <button class="me" id="me-btn"><span class="avatar" id="me-av">?</span><span class="grow"><b id="me-name" style="font-weight:500;font-size:13px">Choose profile</b><br><span class="tiny muted">Local profile</span></span>${icon("updown", "sm")}</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <nav class="topnav"><a href="#/courses">Courses</a><a href="#/challenges">Contest</a></nav>
        <label class="search">${icon("search")}<input id="search" placeholder="search.." autocomplete="off"><div class="search-results hidden" id="search-results"></div></label>
        <button class="btn primary" id="signin">Switch learner</button>
      </header>
      <main class="content" id="view"></main>
      <footer class="footer"><span>© 2026 SkillBridge. Keep moving forward.</span><span class="row"><a href="#" id="help-foot">Help center</a>·<span>Privacy: all data stays on this computer</span>·<span>Terms</span></span></footer>
    </div>
  </div>`;
  document.getElementById("me-btn").onclick = () => profilePicker(true);
  document.getElementById("signin").onclick = () => profilePicker(true);
  document.getElementById("help-btn").onclick = helpCenter;
  document.getElementById("help-foot").onclick = (e) => { e.preventDefault(); helpCenter(); };
  document.querySelectorAll("[data-soon]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); toast("That section isn't part of SkillBridge practice."); }));
  setupSearch();
}

function renderMe() {
  const p = session.profile;
  document.getElementById("me-name").textContent = p ? p.name : "Choose profile";
  document.getElementById("me-av").textContent = p ? initials(p.name) : "?";
  document.getElementById("signin").textContent = p ? "Switch profile" : "Sign In";
}

export async function profilePicker(dismissable) {
  const list = await api("/api/profiles");
  modal(`
    <div><h2>Who's practising?</h2><p class="muted small" style="margin-top:4px">Profiles are local to this computer. No account or password.</p></div>
    <div class="stack">${list.map((p) => `<button class="profile-opt" data-pid="${p.id}"><span class="avatar">${esc(initials(p.name))}</span><span class="grow"><b style="font-weight:500">${esc(p.name)}</b>${p.is_demo ? ' <span class="tag">Demo</span>' : ""}</span>${icon("chevRight", "sm")}</button>`).join("") || '<div class="empty">No profiles yet.</div>'}</div>
    <form class="row" id="new-prof"><input type="text" name="name" placeholder="New profile name" maxlength="40" required><button class="btn primary">Create</button></form>
    <div class="row between small"><span class="muted">Want to see the adaptive engine at work?</span><button class="btn sm" id="seed-demo">${icon("users", "sm")}Load demo learners</button></div>
  `, {
    dismissable,
    onMount(el, close) {
      el.querySelectorAll("[data-pid]").forEach((b) => b.onclick = () => { select(Number(b.dataset.pid)); close(); });
      el.querySelector("#new-prof").onsubmit = async (e) => {
        e.preventDefault();
        try { const p = await api("/api/profiles", { method: "POST", body: { name: e.target.name.value } }); select(p.id); close(); }
        catch (err) { toast(err.message); }
      };
      el.querySelector("#seed-demo").onclick = async (e) => {
        e.target.disabled = true; e.target.textContent = "Running demo learners...";
        try { await api("/api/demo/reset", { method: "POST" }); close(); profilePicker(dismissable); toast("Demo learners Priya and Marcus are ready."); }
        catch (err) { toast(err.message); e.target.disabled = false; }
      };
    },
  });
}

async function select(pid) {
  session.id = pid;
  await boot();
  location.hash = "#/";
  route();
}

function helpCenter() {
  modal(`
    <h2>How SkillBridge works</h2>
    <div class="stack small" style="gap:10px">
      <p><b>Practice by doing.</b> Each scenario is a real task: fix buggy Python that runs against hidden tests, or find the fault in a circuit with a virtual multimeter.</p>
      <p><b>Correctness is decided by code.</b> A deterministic evaluator grades every attempt. The coach only explains what went wrong, using your recorded attempts and the evaluator's verdict.</p>
      <p><b>Mastery per skill.</b> Every finished scenario updates a 0–1 mastery score for each skill it practises. Fewer attempts and fewer hints count for more.</p>
      <p><b>Adaptive next step.</b> The engine picks your weakest unlocked skill and a scenario just above your level. It tells you why on every lesson ("Why this scenario").</p>
      <p><b>Certified mastery</b> needs mastery ≥ 80%, two recent solves near that level, and one hint-free solve of a scenario in a form you haven't seen before (a transfer check).</p>
    </div>
    <div class="row" style="justify-content:flex-end"><button class="btn primary" data-close>Got it</button></div>`);
}

function setupSearch() {
  const input = document.getElementById("search"), box = document.getElementById("search-results");
  input.addEventListener("input", async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { box.classList.add("hidden"); return; }
    const cat = await loadCatalog();
    const hits = [
      ...cat.skills.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ href: `#/courses?skill=${s.id}`, t: s.name, sub: "Skill" })),
      ...cat.scenarios.filter((s) => (s.title + " " + s.prompt).toLowerCase().includes(q)).map((s) => ({ href: `#/challenges?open=${s.id}`, t: s.title, sub: s.domain === "python" ? "Python scenario" : "Circuit scenario" })),
    ].slice(0, 8);
    box.innerHTML = hits.map((h) => `<a href="${h.href}"><div>${esc(h.t)}</div><div class="tiny muted">${h.sub}</div></a>`).join("") || '<div class="empty" style="border:0">No matches</div>';
    box.classList.remove("hidden");
  });
  box.addEventListener("click", () => { box.classList.add("hidden"); input.value = ""; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search")) box.classList.add("hidden"); });
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  return { page: parts[0] || "", args: parts.slice(1), query: Object.fromEntries(new URLSearchParams(qs || "")) };
}

let routeToken = 0;
export async function route() {
  const { page, args, query } = parseHash();
  const mod = PAGES[page] || dashboard;
  const navKey = page === "diagnostic" ? "assessments" : page;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === navKey));
  const view = document.getElementById("view");
  if (!session.profile) { view.innerHTML = '<div class="empty">Choose or create a profile to start.</div>'; return; }
  const token = ++routeToken;
  view.innerHTML = '<div class="row muted"><span class="spinner"></span> Loading…</div>';
  try {
    const out = await mod.render({ args, query });
    if (token !== routeToken) return;
    view.innerHTML = out.html;
    window.scrollTo(0, 0);
    out.mount && out.mount(view);
  } catch (err) {
    if (token !== routeToken) return;
    console.error(err);
    view.innerHTML = `<div class="empty">Something went wrong: ${esc(err.message)}</div>`;
  }
}

export function go(hash) {
  if (location.hash === hash) route(); else location.hash = hash;
}

async function boot() {
  session.profile = null;
  if (session.id) {
    try { session.profile = (await api("/api/profiles")).find((p) => p.id === session.id) || null; } catch { /* server down */ }
  }
  if (!session.profile) session.id = null;
  await loadCatalog(true);
  renderMe();
}

shell();
window.addEventListener("hashchange", route);
boot().then(() => { route(); if (!session.profile) profilePicker(false); });
