import { api, session } from "../api.js";
import { icon, esc, pct, bar, domainIcon, skillIcon, relTime, statusTag } from "../ui.js";
import { bindStarts } from "../actions.js";

export async function render({ query }) {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  const sname = Object.fromEntries(d.skills.map((s) => [s.id, s.name]));
  let tab = query.skill || query.domain ? "skills" : "courses";
  let filter = "all";
  const domFilter = query.domain || (query.skill ? d.skills.find((s) => s.id === query.skill)?.domain : null);

  const courseCards = (f) => d.domains.filter((dm) => f === "all" || (f === "progress" ? dm.mastered < dm.n_skills : dm.mastered === dm.n_skills)).map((dm) => `
    <div class="card stack" style="gap:12px">
      <div class="row between"><span class="tile-icon">${domainIcon(dm.id)}</span>${icon("bookmark", "sm")}</div>
      <div><div class="upper">${dm.id === "python" ? "Development" : "Electronics"}</div><h3 style="font-size:18px">${esc(dm.name)}</h3><div class="tiny muted">${esc(dm.description)}</div></div>
      <div class="row between tiny muted"><span>${dm.solved} / ${dm.n_scenarios} scenarios</span><span>${pct(dm.avg_mastery)}</span></div>${bar(dm.avg_mastery)}
      <div class="tiny muted">${icon("badge", "sm")} ${dm.mastered} of ${dm.n_skills} skills mastered${dm.diagnostic ? "" : " · diagnostic not taken"}</div>
      <div>${dm.active_episode ? `<a class="btn sm" href="#/lessons/${dm.active_episode}">${icon("arrowRight", "sm")}Continue learning</a>`
        : `<button class="btn sm" data-start data-domain="${dm.id}">${icon("arrowRight", "sm")}${dm.attempted ? "Continue learning" : "Start course"}</button>`}</div>
    </div>`).join("") || '<div class="empty">Nothing here yet.</div>';

  const skillCards = () => d.skills.filter((s) => !domFilter || s.domain === domFilter).map((s) => `
    <div class="card stack" style="gap:10px;${query.skill === s.id ? "outline:2px solid #141414" : ""}">
      <div class="row between"><span class="tile-icon">${skillIcon(s.id)}</span>${s.mastered ? '<span class="tag dark">Mastered</span>' : s.blocked_by.length ? `<span class="tag">${icon("lock", "sm")}Locked</span>` : ""}</div>
      <div><div class="upper">${s.domain === "python" ? "Python" : "Circuits"}</div><h3>${esc(s.name)}</h3></div>
      <div class="row between tiny muted"><span>${s.episodes} scenario${s.episodes === 1 ? "" : "s"} practised</span><span>${pct(s.mastery)}</span></div>${bar(s.mastery)}
      <div class="tiny muted">${s.blocked_by.length ? `Practise ${s.blocked_by.map((b) => esc(sname[b])).join(", ")} to 50% first.` : s.prereqs.length ? `Builds on ${s.prereqs.map((p) => esc(sname[p])).join(", ")}.` : "No prerequisites."} ${s.available} unseen scenario${s.available === 1 ? "" : "s"} left.</div>
      <div><button class="btn sm" data-start data-domain="${s.domain}" data-skill="${s.id}" ${s.blocked_by.length || !s.available ? "disabled" : ""}>${icon("target", "sm")}Practise this skill</button></div>
    </div>`).join("");

  const resume = d.history.filter((h) => h.status === "active").concat(d.history.filter((h) => h.status !== "active")).slice(0, 3).map((h) => `
    <a class="list-row" href="#/lessons/${h.id}"><span class="icon-btn">${icon("play", "sm")}</span><div class="grow"><div style="font-weight:500">${esc(h.title)}</div><div class="tiny muted">${esc(h.domain_name)} · ${relTime(h.started_at)}</div></div>${statusTag(h.status)}${icon("arrowUpRight", "sm")}</a>`).join("") || '<div class="empty">Start a course to see your recent scenarios here.</div>';

  const goal = 5, days = d.stats.days_this_week;
  const html = `
    <div class="page-head"><div><h1>My courses</h1><p class="muted">A little progress every day adds up. Keep practising, ${esc(d.profile.name.split(" ")[0])}.</p></div>
      <a class="btn primary" href="#/challenges">${icon("plus", "sm")}Explore scenarios</a></div>
    <div class="tabs" id="ctabs"><button data-t="courses">My courses (${d.domains.length})</button><button data-t="skills">Skills (${d.skills.length})</button></div>
    <div class="row between" id="filters"></div>
    <div class="grid g4" id="cards"></div>
    <div class="split wide-right">
      <div class="card"><div class="section-head"><h2>Pick up where you left off</h2><a class="link" href="#/projects">View history ${icon("arrowRight", "sm")}</a></div>${resume}</div>
      <div class="card"><div class="row between"><h2>Your weekly goal</h2>${icon("flame")}</div>
        <div class="pill-num" style="margin:10px 0">${Math.min(days, goal)} of ${goal} days</div>
        <div class="row" style="gap:8px">${d.week.map((w) => `<div class="stack" style="align-items:center;gap:4px"><span style="width:26px;height:26px;border-radius:50%;display:grid;place-items:center;${w.practiced ? "background:#141414;color:#fff" : "border:1px solid #e2e2e2"}">${w.practiced ? icon("check", "sm") : ""}</span><span class="tiny muted">${w.day}</span></div>`).join("")}</div>
        <p class="tiny muted" style="margin-top:12px">${days >= goal ? "Goal reached this week." : `${goal - Math.min(days, goal)} more practice day${goal - days === 1 ? "" : "s"} to reach your goal.`}</p></div>
    </div>`;

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelectorAll("#ctabs button").forEach((b) => b.classList.toggle("active", b.dataset.t === tab));
        if (tab === "courses") {
          root.querySelector("#filters").innerHTML = `<div class="row">${[["all", "All courses"], ["progress", "In progress"], ["done", "Completed"]].map(([k, l]) => `<button class="chip ${filter === k ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}</div><span class="tiny muted">Sorted by: course</span>`;
          root.querySelector("#cards").className = "grid g2";
          root.querySelector("#cards").innerHTML = courseCards(filter);
        } else {
          root.querySelector("#filters").innerHTML = `<div class="row">${[["", "All skills"], ...d.domains.map((x) => [x.id, x.short])].map(([k, l]) => `<a class="chip ${(domFilter || "") === k ? "active" : ""}" href="#/courses?domain=${k}">${l}</a>`).join("")}</div><span class="tiny muted">Prerequisites unlock at 50% mastery</span>`;
          root.querySelector("#cards").className = "grid g4";
          root.querySelector("#cards").innerHTML = skillCards();
        }
        root.querySelectorAll("[data-f]").forEach((c) => c.onclick = () => { filter = c.dataset.f; draw(); });
        bindStarts(root.querySelector("#cards"));
      };
      root.querySelectorAll("#ctabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      draw();
    },
  };
}
