import { api, session } from "../api.js";
import { icon, esc, pct, fmtDate, domainIcon, statusTag, modeLabel } from "../ui.js";
import { bindStarts } from "../actions.js";

export async function render() {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  const done = d.history.filter((h) => h.status === "solved" || h.status === "failed");
  const diags = d.domains.filter((x) => x.diagnostic).length;
  const pending = d.skills.filter((s) => s.transfer_pending);
  const transfers = done.filter((h) => h.transfer_skills.length);
  const scores = done.map((h) => h.score);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  let tab = "overview";

  const diagCard = (dm) => `
    <div class="card stack" style="gap:12px">
      <div class="row between"><span class="tile-icon">${domainIcon(dm.id)}</span><span class="tag">${dm.diagnostic ? "Completed" : dm.attempted ? "Skipped" : "Ready to start"}</span></div>
      <div><div class="tiny muted">${esc(dm.name)}</div><h3 style="font-size:18px">Diagnostic check</h3><p class="small muted">One quick question per skill sets your starting mastery, so the first scenarios fit your level.</p></div>
      <div class="kv"><span>${icon("list", "sm")}6 questions</span><span>${icon("clock", "sm")}3 minutes</span></div>
      <div>${dm.diagnostic ? `<a class="btn" href="#/diagnostic/${dm.id}">${icon("eye", "sm")}View result</a>`
        : dm.attempted ? '<span class="tiny muted">Only available before you start practising.</span>' : `<a class="btn primary" href="#/diagnostic/${dm.id}">${icon("play", "sm")}Start assessment</a>`}</div>
    </div>`;

  const transferCard = (s) => `
    <div class="card stack" style="gap:12px">
      <div class="row between"><span class="tile-icon">${icon("sparkle")}</span><span class="tag dark">Transfer check due</span></div>
      <div><div class="tiny muted">${s.domain === "python" ? "Python Debugging" : "Circuit Troubleshooting"}</div><h3 style="font-size:18px">${esc(s.name)}</h3>
        <p class="small muted">Your mastery is ${pct(s.mastery)}. To confirm it, solve a scenario you have never seen, in a different form, with no hints.</p></div>
      <div><button class="btn primary" data-start data-domain="${s.domain}" data-skill="${s.id}" ${s.available ? "" : "disabled"}>${icon("play", "sm")}Start transfer check</button></div>
    </div>`;

  const rows = (list) => list.map((h) => `
    <tr><td><a href="#/lessons/${h.id}" style="font-weight:500">${esc(h.title)}</a><div class="tiny muted">${esc(h.domain_name)}</div></td>
      <td>${fmtDate(h.ended_at)}</td><td><b style="font-weight:500">${pct(h.score)}</b></td><td>${modeLabel(h.mode)}${h.transfer_skills.length ? ' <span class="tag">transfer</span>' : ""}</td><td>${statusTag(h.status)}</td>
      <td style="text-align:right"><a class="link" href="#/lessons/${h.id}">Review ${icon("arrowRight", "sm")}</a></td></tr>`).join("");

  const html = `
    <div class="page-head"><div><h1>Assessments</h1><p class="muted">Put your knowledge to the test. See how far you've come.</p></div><a class="btn" href="#/">${icon("chart", "sm")}View learning report</a></div>
    <div class="grid g3">
      <div class="card stat"><div class="row between"><span>Scenarios completed</span><span class="icon-btn boxed">${icon("list")}</span></div><div class="row" style="align-items:baseline"><span class="pill-num">${done.length}</span><span class="tiny muted">across ${new Set(done.map((h) => h.domain)).size} course(s)</span></div></div>
      <div class="card stat"><div class="row between"><span>Average score</span><span class="icon-btn boxed">${icon("chart")}</span></div><div class="row" style="align-items:baseline"><span class="pill-num">${pct(avg)}</span><span class="tiny muted">${transfers.length} transfer check${transfers.length === 1 ? "" : "s"} taken</span></div></div>
      <div class="card stat"><div class="row between"><span>Ready to take</span><span class="icon-btn boxed">${icon("help")}</span></div><div class="row" style="align-items:baseline"><span class="pill-num">${String(d.domains.length - diags - d.domains.filter((x) => !x.diagnostic && x.attempted).length + pending.length).padStart(2, "0")}</span><span class="tiny muted">diagnostics and transfer checks</span></div></div>
    </div>
    <div class="tabs" id="atabs"><button data-t="overview">Overview</button><button data-t="available">Available (${pending.length + d.domains.filter((x) => !x.diagnostic && !x.attempted).length})</button><button data-t="completed">Completed (${done.length})</button></div>
    <div id="abody"></div>`;

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelectorAll("#atabs button").forEach((b) => b.classList.toggle("active", b.dataset.t === tab));
        const ready = `<div class="section-head"><h2>Ready when you are</h2><span class="tiny muted">Mastery needs ≥ 80% plus a hint-free transfer solve</span></div>
          <div class="grid g2">${d.domains.map(diagCard).join("")}${pending.map(transferCard).join("")}</div>`;
        const table = `<div class="card"><div class="section-head"><h2>Recent results</h2></div>${done.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>Scenario</th><th>Completed</th><th>Score</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>${rows(tab === "completed" ? done : done.slice(0, 6))}</tbody></table></div>` : '<div class="empty">No completed scenarios yet.</div>'}</div>`;
        root.querySelector("#abody").innerHTML = tab === "overview" ? ready + table : tab === "available" ? ready : table;
        bindStarts(root.querySelector("#abody"));
      };
      root.querySelectorAll("#atabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      draw();
    },
  };
}
