// "Projects" is the practice history: every scenario attempt as a card, plus the latest coach feedback.
import { api, session, loadCatalog, skillName } from "../api.js";
import { icon, esc, pct, relTime, fmtDate, dur, statusTag, modeLabel, initials, reasonList } from "../ui.js";
import { bindStarts } from "../actions.js";

export async function render() {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  await loadCatalog();
  let tab = "all", dom = "all";
  const hist = d.history;
  const counts = { all: hist.length, active: hist.filter((h) => h.status === "active").length, solved: hist.filter((h) => h.status === "solved").length, failed: hist.filter((h) => h.status === "failed").length };

  const thumb = (h) => {
    const sc = session.catalog.scenarios.find((s) => s.id === h.scenario_id);
    return h.domain === "python"
      ? `<div class="thumb dark">${esc((sc?.prompt || "").slice(0, 140))}</div>`
      : `<div class="thumb">${icon("zap", "lg")}</div>`;
  };
  const card = (h) => `
    <div class="card stack" style="gap:10px">${thumb(h)}
      <div class="row between">${statusTag(h.status)}<span class="tag">${modeLabel(h.mode)}</span></div>
      <div class="tiny muted">${esc(h.domain_name)}</div><h3>${esc(h.title)}</h3>
      <div class="kv"><span>${h.attempts} attempt${h.attempts === 1 ? "" : "s"}</span><span>${h.hints} hint${h.hints === 1 ? "" : "s"}</span><span>${dur(h.active_seconds)}</span>${h.score != null ? `<span>score ${pct(h.score)}</span>` : ""}</div>
      ${h.mastery_changes ? `<div class="tiny">${Object.entries(h.mastery_changes).map(([k, [a, b]]) => `${esc(skillName(k))} <span class="delta ${b >= a ? "up" : "down"}">${pct(a)}→${pct(b)}</span>`).join(" · ")}</div>` : ""}
      <div class="tiny faint">${h.status === "active" ? "Started " + relTime(h.started_at) : "Completed " + fmtDate(h.ended_at)}</div>
      <div><a class="btn sm" href="#/lessons/${h.id}">${icon("arrowRight", "sm")}${h.status === "active" ? "Open scenario" : "Review"}</a></div>
    </div>`;

  const fb = d.latest_feedback;
  const rec = d.domains.find((x) => x.recommendation?.scenario)?.recommendation;
  const html = `
    <div class="page-head"><div><h1>Practice history</h1><p class="muted">Every scenario you've worked on, with the attempts, hints, time and mastery change it produced.</p></div>
      <button class="btn primary" data-start data-domain="${rec ? d.domains.find((x) => x.recommendation === rec).id : "python"}">${icon("plus", "sm")}New scenario</button></div>
    <div class="tabs" id="ptabs">${[["all", "All"], ["active", "In progress"], ["solved", "Solved"], ["failed", "Not solved"]].map(([k, l]) => `<button data-t="${k}">${l} (${counts[k]})</button>`).join("")}</div>
    <div class="row between"><div class="row" id="pdom">${[["all", "All courses"], ...d.domains.map((x) => [x.id, x.short])].map(([k, l]) => `<button class="chip" data-d="${k}">${icon("sliders", "sm")} ${l}</button>`).join("")}</div><span class="tiny muted">Last updated ↓</span></div>
    <div class="grid g3" id="pgrid"></div>
    <div class="split wide-right">
      <div class="card"><div class="section-head"><h2>Latest feedback</h2><span class="tiny muted">${fb ? fmtDate(fb.ts) : ""}</span></div>
        ${fb ? `<div class="row" style="margin-bottom:12px"><span class="avatar">${fb.coach.source === "claude" ? icon("sparkle", "sm") : esc(initials("Coach"))}</span><div class="grow"><b style="font-weight:500">SkillBridge coach</b><div class="tiny muted">${esc(fb.title)} · ${fb.coach.source === "claude" ? "Claude" : "template feedback"}</div></div>${fb.status === "solved" ? '<span class="tag">Solved</span>' : '<span class="tag">Not solved</span>'}</div>
          <p class="small">"${esc(fb.coach.headline)} ${esc(fb.coach.why)} ${esc(fb.coach.next_time)}"</p>
          <a class="link" style="margin-top:12px" href="#/lessons/${fb.episode_id}">View full feedback ${icon("arrowRight", "sm")}</a>` : '<div class="empty">Coach feedback appears here after you finish a scenario.</div>'}</div>
      <div class="card"><div class="row" style="margin-bottom:8px">${icon("target")}<h2>Your next build</h2></div>
        ${rec ? `<h3>${esc(rec.scenario.title)}</h3><p class="small muted" style="margin:6px 0 10px">${esc(rec.skill_name)} · difficulty ${rec.scenario.difficulty.toFixed(2)} · ${modeLabel(rec.mode)}</p><div class="stack">${reasonList(rec.reasons.slice(0, 1))}</div>` : '<p class="small muted">Nothing left to recommend.</p>'}
      </div>
    </div>`;

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelectorAll("#ptabs button").forEach((b) => b.classList.toggle("active", b.dataset.t === tab));
        root.querySelectorAll("#pdom .chip").forEach((b) => b.classList.toggle("active", b.dataset.d === dom));
        const items = hist.filter((h) => (tab === "all" || h.status === tab) && (dom === "all" || h.domain === dom));
        root.querySelector("#pgrid").innerHTML = items.map(card).join("") || '<div class="empty">Nothing here yet.</div>';
      };
      root.querySelectorAll("#ptabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      root.querySelectorAll("#pdom .chip").forEach((b) => b.onclick = () => { dom = b.dataset.d; draw(); });
      bindStarts(root);
      draw();
    },
  };
}
