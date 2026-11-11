import { api, session } from "../api.js";
import { icon, esc, pct, bar, fmtDate, domainIcon, modal, toast } from "../ui.js";
import { bindStarts } from "../actions.js";

const certId = (pid, dom) => `SB-${dom.slice(0, 3).toUpperCase()}-${String(pid).padStart(4, "0")}`;

export async function render() {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  const earned = d.domains.filter((dm) => dm.mastered === dm.n_skills);
  const masteredSkills = d.skills.filter((s) => s.mastered);
  const lastTs = (dom) => Math.max(0, ...d.history.filter((h) => h.domain === dom && h.ended_at).map((h) => h.ended_at));
  let tab = "mine";

  const paper = (dm, locked) => `
    <div class="cert-paper ${locked ? "locked" : ""}">
      <div class="top"><span class="row" style="font-weight:600">${icon("power", "sm")}SkillBridge</span><span class="upper">Certificate of mastery</span></div>
      <div class="small muted">This certificate is proudly presented to</div>
      <div class="name">${esc(d.profile.name)}</div>
      <div class="small muted">for demonstrating verified mastery of every skill in</div>
      <div style="font-size:19px;font-weight:500">${esc(dm.name)}</div>
      ${icon("award", "lg")}
      <div class="bottom"><span>${locked ? "Not yet earned" : fmtDate(lastTs(dm.id))}<br>${certId(d.profile.id, dm.id)}</span><span><span class="sig">SkillBridge Engine</span><br>VERIFIED BY THE EVALUATOR</span></div>
    </div>`;

  const earnedHtml = earned.length ? earned.map((dm) => {
    const sk = d.skills.filter((s) => s.domain === dm.id);
    const done = d.history.filter((h) => h.domain === dm.id && h.status === "solved");
    const avg = done.length ? done.reduce((a, h) => a + h.score, 0) / done.length : 0;
    return `<div class="card"><div class="grid" style="grid-template-columns:1.4fr 1fr;gap:26px;align-items:center">
      <div class="cert">${paper(dm, false)}</div>
      <div class="stack" style="gap:12px"><span class="tag dark" style="align-self:flex-start">Certificate earned</span><h2 style="font-size:24px">${esc(dm.name)}</h2>
        <div class="small muted">Issued ${fmtDate(lastTs(dm.id))}</div>
        <p class="small">${sk.length} skills, each confirmed with a hint-free transfer solve.</p>
        <div class="kpi"><div><b>${pct(avg)}</b><span class="tiny muted">Average score</span></div><div><b>${done.length}</b><span class="tiny muted">Scenarios solved</span></div></div>
        <div class="row"><button class="btn primary" data-print>${icon("download", "sm")}Download PDF</button><button class="btn" data-copy="${certId(d.profile.id, dm.id)}">${icon("share", "sm")}Share</button></div></div>
    </div></div>`;
  }).join("") : `<div class="card"><div class="grid" style="grid-template-columns:1.4fr 1fr;gap:26px;align-items:center"><div class="cert">${paper(d.domains[0], true)}</div>
      <div class="stack" style="gap:10px"><span class="tag" style="align-self:flex-start">No certificate yet</span><h2>Earn your first certificate</h2>
      <p class="small muted">A course certificate is issued when every skill in it is mastered: mastery ≥ 80%, the last two scenarios near that level solved, and one of them a never-seen scenario in a new form, solved without hints.</p>
      <p class="small">${masteredSkills.length ? `Skills mastered so far: ${masteredSkills.map((s) => esc(s.name)).join(", ")}.` : "No skills mastered yet."}</p></div></div></div>`;

  const next = d.domains.filter((dm) => dm.mastered < dm.n_skills).map((dm) => {
    const sk = d.skills.filter((s) => s.domain === dm.id);
    const due = sk.filter((s) => s.transfer_pending).length, below = sk.filter((s) => s.mastery < 0.8).length;
    return `<div class="card stack" style="gap:12px">
      <div class="row"><span class="tile-icon">${domainIcon(dm.id)}</span><h3>${esc(dm.name)}</h3></div>
      <div class="row between tiny muted"><span>${dm.mastered} of ${dm.n_skills} skills mastered</span><span>${pct(dm.mastered / dm.n_skills)}</span></div>${bar(dm.mastered / dm.n_skills)}
      <div class="stack small" style="gap:6px">
        <span class="row">${icon(below ? "clock" : "check", "sm")}${below} skill${below === 1 ? "" : "s"} below 80% mastery</span>
        <span class="row">${icon(due ? "sparkle" : "check", "sm")}${due} transfer check${due === 1 ? "" : "s"} due</span>
      </div>
      <div>${dm.active_episode ? `<a class="btn sm" href="#/lessons/${dm.active_episode}">${icon("arrowRight", "sm")}Continue course</a>` : `<button class="btn sm" data-start data-domain="${dm.id}">${icon("arrowRight", "sm")}Continue course</button>`}</div>
    </div>`;
  }).join("");

  const html = `
    <div class="page-head"><div><h1>Certification</h1><p class="muted">Skills you've built. Achievements you can share.</p></div><button class="btn" id="verify">${icon("badge", "sm")}Verify a certificate</button></div>
    <div class="tabs" id="ctabs"><button data-t="mine">My certificates (${earned.length})</button><button data-t="skills">Mastered skills (${masteredSkills.length})</button><button data-t="about">About certification</button></div>
    <div id="cbody"></div>
    ${next ? `<div><div class="section-head"><h2>Your next achievements</h2><span class="tiny muted">Master every skill. Pass the transfer checks. Make it official.</span></div><div class="grid g2">${next}</div></div>` : ""}
    <div class="notice">${icon("shield")}<div><b>Verified by code, not by AI</b><div class="tiny muted">Every attempt counted here was graded by a deterministic evaluator. The coach never decides correctness.</div></div></div>`;

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelectorAll("#ctabs button").forEach((b) => b.classList.toggle("active", b.dataset.t === tab));
        const body = root.querySelector("#cbody");
        if (tab === "mine") body.innerHTML = earnedHtml;
        else if (tab === "skills") body.innerHTML = `<div class="card">${masteredSkills.length ? masteredSkills.map((s) => `<div class="list-row">${icon("award")}<div class="grow"><b style="font-weight:500">${esc(s.name)}</b><div class="tiny muted">${s.domain === "python" ? "Python Debugging" : "Circuit Troubleshooting"} · mastery ${pct(s.mastery)}</div></div><span class="tag dark">Mastered</span></div>`).join("") : '<div class="empty">No mastered skills yet. Mastery needs a hint-free transfer solve.</div>'}</div>`;
        else body.innerHTML = `<div class="card stack small" style="gap:10px"><p><b>Mastery rule.</b> A skill is mastered when (1) mastery ≥ 0.8, (2) the last two scenarios near that difficulty (difficulty ≥ mastery − 0.4) were solved, and (3) one of them was a scenario you had never seen, in a surface form you hadn't practised for that skill, solved with no hints.</p>
          <p><b>Course certificate.</b> Issued when every skill in a course is mastered.</p><p><b>Transfer checks.</b> When your mastery reaches 0.8 without a qualifying transfer solve, the engine picks a never-seen scenario in a new form for you (also on the Assessments page).</p></div>`;
        root.querySelectorAll("[data-print]").forEach((b) => b.onclick = () => window.print());
        root.querySelectorAll("[data-copy]").forEach((b) => b.onclick = () => { navigator.clipboard?.writeText(`SkillBridge certificate ${b.dataset.copy} for ${d.profile.name}`); toast("Certificate ID copied."); });
      };
      root.querySelectorAll("#ctabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
      root.querySelector("#verify").onclick = () => modal(`<h3>Verify a certificate</h3><input type="text" id="cid" placeholder="e.g. SB-PYT-0001"><div id="vres" class="small"></div><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Close</button><button class="btn primary" id="vgo">Verify</button></div>`,
        { onMount: (el) => el.querySelector("#vgo").onclick = () => {
          const v = el.querySelector("#cid").value.trim().toUpperCase();
          const ok = earned.some((dm) => certId(d.profile.id, dm.id) === v);
          el.querySelector("#vres").innerHTML = ok ? `${icon("check", "sm")} Valid: issued to ${esc(d.profile.name)}.` : "Not found among certificates earned on this computer.";
        } });
      bindStarts(root);
      draw();
    },
  };
}
