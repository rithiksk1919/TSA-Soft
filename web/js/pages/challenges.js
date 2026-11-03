import { api, session, loadCatalog, skillName } from "../api.js";
import { icon, esc, domainIcon, statusTag, diffLabel, modal } from "../ui.js";
import { startPractice } from "../actions.js";

export async function render({ query }) {
  const cat = await loadCatalog(true);
  const rec = {};
  for (const d of cat.domains) rec[d.id] = await api(`/api/profiles/${session.id}/recommendation?domain=${d.id}`);
  let dom = query.domain || "all", status = "all";

  const html = `
    <div class="page-head"><div><h1>Challenges</h1><p class="muted">Every scenario in the library. The engine normally chooses for you. Pick one here to practise freely (it's logged as your own choice).</p></div></div>
    <div class="row between wrap"><div class="row wrap" id="df"></div><div class="row wrap" id="sf"></div></div>
    <div class="grid g3" id="list"></div>`;

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelector("#df").innerHTML = [["all", "All"], ...cat.domains.map((d) => [d.id, d.short])].map(([k, l]) => `<button class="chip ${dom === k ? "active" : ""}" data-d="${k}">${l}</button>`).join("");
        root.querySelector("#sf").innerHTML = [["all", "Any status"], ["new", "Not started"], ["solved", "Solved"], ["failed", "Not solved"]].map(([k, l]) => `<button class="chip ${status === k ? "active" : ""}" data-s="${k}">${l}</button>`).join("");
        const items = cat.scenarios.filter((s) => (dom === "all" || s.domain === dom) && (status === "all" || s.status === status));
        root.querySelector("#list").innerHTML = items.map((s) => {
          const isRec = rec[s.domain]?.scenario_id === s.id;
          return `<div class="card stack" style="gap:10px;${query.open === s.id ? "outline:2px solid #141414" : ""}">
            <div class="row between"><span class="tile-icon">${domainIcon(s.domain)}</span><span class="row">${isRec ? '<span class="tag dark">Recommended</span>' : ""}${statusTag(s.status)}</span></div>
            <div><div class="upper">${diffLabel(s.difficulty)} · difficulty ${s.difficulty.toFixed(2)}</div><h3>${esc(s.title)}</h3></div>
            <p class="small muted" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(s.prompt)}</p>
            <div class="row wrap">${s.skills.map((k) => `<span class="tag">${esc(skillName(k))}</span>`).join("")}<span class="tag" title="surface form">${esc(s.surface_form)}</span></div>
            <div class="row between"><span class="tiny muted">${icon("clock", "sm")} ~${s.estimated_minutes} min${s.scaffold ? " · scaffolded" : ""}</span><button class="btn sm" data-sc="${s.id}">${icon("play", "sm")}Open</button></div>
          </div>`;
        }).join("") || '<div class="empty">No scenarios match.</div>';
        root.querySelectorAll("[data-d]").forEach((b) => b.onclick = () => { dom = b.dataset.d; draw(); });
        root.querySelectorAll("[data-s]").forEach((b) => b.onclick = () => { status = b.dataset.s; draw(); });
        root.querySelectorAll("[data-sc]").forEach((b) => b.onclick = () => {
          const s = cat.scenarios.find((x) => x.id === b.dataset.sc);
          if (rec[s.domain]?.scenario_id === s.id) return startPractice({ domain: s.domain }, b);
          modal(`<h3>Practise "${esc(s.title)}"?</h3><p class="small muted">The engine would pick <b>${esc(rec[s.domain]?.scenario?.title || "something else")}</b> for you right now. Your own picks still update mastery, and are logged as "your choice". If you have another scenario in progress in this course, it will be closed.</p>
            <div class="row" style="justify-content:flex-end"><button class="btn" id="eng">Use the recommendation</button><button class="btn primary" id="mine">Open this one</button></div>`,
            { onMount: (el, close) => { el.querySelector("#eng").onclick = () => { close(); startPractice({ domain: s.domain }); }; el.querySelector("#mine").onclick = () => { close(); startPractice({ scenario_id: s.id }); }; } });
        });
      };
      draw();
    },
  };
}
