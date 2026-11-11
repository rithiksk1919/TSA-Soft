import { api, session } from "../api.js";
import { icon, esc, pct, bar, initials, relTime, fmtDate, dur, domainIcon, skillIcon, statusTag, modeLabel, reasonList } from "../ui.js";
import { masteryChart, buildMasterySeries } from "../charts.js";
import { bindStarts } from "../actions.js";

export async function render() {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  const first = d.profile.name.split(" ")[0];
  const s = d.stats;
  const skillName = Object.fromEntries(d.skills.map((k) => [k.id, k.name]));

  const stat = (label, value, sub, ic) => `
    <div class="card stat"><div class="row between"><span>${label}</span><span class="icon-btn boxed">${icon(ic)}</span></div>
    <div><div class="pill-num">${value}</div><div class="tiny faint">${sub}</div></div></div>`;

  const courseCard = (dm) => `
    <div class="card course-card">
      <span class="tile-icon">${domainIcon(dm.id)}</span>
      <div><h3>${esc(dm.name)}</h3><div class="tiny muted">${dm.mastered}/${dm.n_skills} skills mastered · ${dm.solved}/${dm.n_scenarios} scenarios solved</div></div>
      <div class="row">${bar(dm.avg_mastery)}<span class="tiny muted" style="white-space:nowrap">${pct(dm.avg_mastery)} avg mastery</span></div>
      <div class="row">${dm.active_episode
        ? `<a class="btn sm primary" href="#/lessons/${dm.active_episode}">${icon("play", "sm")}Resume</a>`
        : `<button class="btn sm primary" data-start data-domain="${dm.id}">${icon("play", "sm")}${dm.diagnostic || dm.attempted ? "Practise next" : "Start with diagnostic"}</button>`}
        <a class="btn sm" href="#/courses?domain=${dm.id}">Skills</a></div>
    </div>`;

  const focus = `
    <div class="card"><h3 style="margin-bottom:12px">Daily progress</h3>
      <div class="row" style="gap:6px;margin-bottom:14px">${d.week.map((w) => `<span title="${w.practiced ? "practised" : ""}" style="width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-size:11px;${w.practiced ? "background:#141414;color:#fff" : "border:1px solid #e2e2e2;color:#9a9a9a"}${w.today ? ";outline:2px solid #141414;outline-offset:2px" : ""}">${w.day}</span>`).join("")}</div>
      <div class="mini-list stack" style="gap:4px">
        ${d.domains.map((dm) => `<div class="item ${dm.hint_dependency.flagged ? "active" : ""}">${domainIcon(dm.id, "sm")}<span class="grow">${esc(dm.short)}: hints on ${dm.hint_dependency.hinted} of last ${dm.hint_dependency.window || 0}</span>${dm.hint_dependency.flagged ? '<span class="tag warn">Hint dependency</span>' : '<span class="tag">OK</span>'}</div>`).join("")}
      </div>
      <p class="tiny muted" style="margin-top:10px">Hint dependency is flagged when hints were used on more than half of your last 5 scenarios. The engine then prefers more scaffolded scenarios.</p>
    </div>`;

  const mistakes = d.recent_mistakes.length ? d.recent_mistakes.slice(0, 5).map((m) => `
    <a class="card flat list-row" style="padding:14px 16px;border-bottom:1px solid #ececec" href="#/lessons/${m.episode_id}">
      <span class="tile-icon">${domainIcon(m.domain)}</span>
      <div class="grow"><div style="font-weight:500">${esc(m.title)}</div>
        <div class="kv" style="margin-top:4px"><span>${icon("x", "sm")}Attempt ${m.attempt_no}</span><span>${esc(m.details[0] || "")}</span></div>
        <div class="row wrap" style="margin-top:6px">${m.failed_skills.map((k) => `<span class="tag">${skillIcon(k, "sm")}${esc(skillName[k] || k)}</span>`).join("")}</div></div>
      <span class="tiny faint">${relTime(m.ts)}</span></a>`).join("") : '<div class="empty">No mistakes recorded yet. Failed attempts show up here with the skills they point to.</div>';

  const recs = d.domains.map((dm) => {
    const r = dm.recommendation;
    if (!r.scenario) return `<div class="card">${domainIcon(dm.id)} Nothing left to recommend in ${esc(dm.name)}.</div>`;
    return `
    <div class="card stack" style="gap:10px">
      <div class="row"><span class="tile-icon">${domainIcon(dm.id)}</span><div class="grow"><div style="font-weight:500">${esc(r.scenario.title)}</div>
        <div class="tiny muted">${esc(dm.short)} · ${esc(r.skill_name)} · difficulty ${r.scenario.difficulty.toFixed(2)}</div></div>
        <span class="tag">${modeLabel(r.mode)}</span></div>
      <div class="kv"><span>${icon("target", "sm")}priority ${r.priority.toFixed(2)}</span><span>${icon("sliders", "sm")}target difficulty ${r.target_difficulty.toFixed(2)}</span></div>
      <details><summary class="link" style="cursor:pointer">Why this scenario?</summary><div class="stack" style="margin-top:8px">${reasonList(r.reasons)}</div></details>
      <div>${dm.active_episode ? `<a class="btn sm" href="#/lessons/${dm.active_episode}">Finish "${esc(dm.active_title)}" first</a>` : `<button class="btn sm primary" data-start data-domain="${dm.id}">${icon("play", "sm")}Start</button>`}</div>
    </div>`;
  }).join("");

  const masteryRows = d.domains.map((dm) => `
    <div style="margin-top:6px"><div class="upper" style="margin:10px 0 2px">${esc(dm.name)}</div>
    ${d.skills.filter((k) => k.domain === dm.id).map((k) => `
      <div class="mastery-row"><span class="row">${skillIcon(k.id, "sm")}${esc(k.name)}</span>${bar(k.mastery)}<b style="font-weight:500;text-align:right">${pct(k.mastery)}</b>
        <span style="text-align:right">${k.mastered ? '<span class="tag dark">' + icon("check", "sm") + "Mastered</span>"
          : k.transfer_pending ? '<span class="tag">Transfer check due</span>'
          : k.blocked_by.length ? `<span class="tag" title="Prerequisite below 50%">${icon("lock", "sm")}Needs ${esc(skillName[k.blocked_by[0]])}</span>`
          : k.consecutive_failures >= 2 ? '<span class="tag bad">2 fails in a row</span>'
          : `<span class="tag" title="Error rate over last 5 attempts">errors ${pct(k.error_rate)}</span>`}</span></div>`).join("")}</div>`).join("");

  const histRows = d.history.slice(0, 8).map((h) => `
    <tr><td><a href="#/lessons/${h.id}" style="font-weight:500">${esc(h.title)}</a><div class="tiny muted">${esc(h.domain_name)}</div></td>
      <td>${modeLabel(h.mode)}${h.transfer_skills.length ? ' <span class="tag">transfer</span>' : ""}</td><td>${h.attempts}</td><td>${h.hints}</td>
      <td>${h.score == null ? "–" : pct(h.score)}</td><td>${dur(h.active_seconds)}</td><td>${statusTag(h.status)}</td><td class="tiny muted">${fmtDate(h.started_at)}</td></tr>`).join("");

  const html = `
    <div class="welcome"><span class="avatar lg">${esc(initials(d.profile.name))}</span><div><h2>Welcome back ${esc(first)}</h2><div class="tiny muted">Here's an overview of your practice</div></div></div>
    <div class="grid g3">
      ${stat("Scenarios solved", `${s.solved}<span class="muted" style="font-size:16px"> / ${s.attempted}</span>`, `${s.hints} hints used · ${s.active_minutes} active minutes`, "eye")}
      ${stat("Skills mastered", `${s.mastered}<span class="muted" style="font-size:16px"> / ${s.n_skills}</span>`, "mastery ≥ 80% + a hint-free transfer solve", "check")}
      ${stat("Average attempt score", s.avg_score == null ? "–" : pct(s.avg_score), "fewer attempts and hints score higher", "help")}
    </div>
    <div class="split">
      <div><h2 style="margin-bottom:14px">Your courses</h2><div class="grid g2">${d.domains.map(courseCard).join("")}</div></div>
      <div style="padding-top:38px">${focus}</div>
    </div>
    <div class="split">
      <div><div class="section-head"><h2>Recent mistakes</h2><a class="link" href="#/projects">History ${icon("arrowRight", "sm")}</a></div><div class="stack" style="gap:10px">${mistakes}</div></div>
      <div><div class="section-head"><h2>Recommended next</h2></div><div class="stack" style="gap:12px">${recs}</div></div>
    </div>
    <div class="split wide-right">
      <div class="card"><div class="section-head"><h2>Mastery over time</h2>
        <div class="row" id="chart-domain">${d.domains.map((dm, i) => `<button class="chip ${i === 0 ? "active" : ""}" data-d="${dm.id}">${esc(dm.short)}</button>`).join("")}</div></div>
        <div id="chart"></div></div>
      <div class="card"><div class="section-head"><h2>Skill mastery</h2></div>${masteryRows}</div>
    </div>
    <div class="card"><div class="section-head"><h2>Practice history</h2><a class="link" href="#/projects">View all ${icon("arrowRight", "sm")}</a></div>
      ${d.history.length ? `<div style="overflow:auto"><table class="tbl"><thead><tr><th>Scenario</th><th>Chosen as</th><th>Attempts</th><th>Hints</th><th>Score</th><th>Active time</th><th>Status</th><th>Date</th></tr></thead><tbody>${histRows}</tbody></table></div>` : '<div class="empty">No scenarios yet.</div>'}
    </div>`;

  return {
    html,
    mount(root) {
      bindStarts(root);
      const titles = Object.fromEntries(d.history.map((h) => [h.id, h.title]));
      const drawChart = (dom) => {
        const sk = d.skills.filter((k) => k.domain === dom);
        const { events, series } = buildMasterySeries(d.mastery_series, sk.map((k) => k.id), (eid) => titles[eid] || `Scenario ${eid}`);
        const el = root.querySelector("#chart");
        if (events.length <= 1) { el.innerHTML = '<div class="empty">Finish a scenario or the diagnostic to see your mastery move.</div>'; return; }
        masteryChart(el, { skills: sk.map((k) => ({ id: k.id, name: k.name })), series, events });
      };
      root.querySelectorAll("#chart-domain .chip").forEach((c) => c.addEventListener("click", () => {
        root.querySelectorAll("#chart-domain .chip").forEach((x) => x.classList.toggle("active", x === c));
        drawChart(c.dataset.d);
      }));
      drawChart(d.domains[0].id);
    },
  };
}
