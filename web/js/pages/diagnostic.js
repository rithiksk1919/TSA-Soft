import { api, session, domainName } from "../api.js";
import { icon, esc, pct, toast, busy, reasonList } from "../ui.js";


export async function render({ args, query }) {
  const domain = args[0] || "python";
  const d = await api(`/api/profiles/${session.id}/diagnostic/${domain}`);
  const answers = {};

  if (d.status) return { html: resultHtml(domain, d, d.status.result), mount: bindResult };

  const html = `
    <div class="crumbs"><a href="#/assessments">Assessments</a>/<span>Diagnostic</span></div>
    <div class="page-head" style="margin-top:-12px"><div><h1>${esc(domainName(domain))}: diagnostic</h1>
      <p class="muted">One question per skill. Your answers set your starting mastery (correct 50%, incorrect 20%, not sure 30%), so the engine starts you at the right level. There is no penalty for "Not sure yet".</p></div></div>
    <div class="stack" style="gap:14px;max-width:820px">${d.items.map((q, i) => `
      <div class="quiz-q" data-q="${q.id}">
        <div class="row between"><b style="font-weight:500">${i + 1}. ${esc(q.question)}</b><span class="tag">${esc(d.skills[q.skill])}</span></div>
        ${q.code ? `<pre>${esc(q.code)}</pre>` : ""}
        <div class="opts">${q.options.map((o, k) => `<button class="opt" data-k="${k}">${esc(o)}</button>`).join("")}<button class="opt unsure" data-k="unsure">Not sure yet</button></div>
      </div>`).join("")}
      <div class="row"><button class="btn primary lg" id="finish">${icon("check", "sm")}Finish diagnostic</button>
        ${query.then === "practice" ? `<button class="btn ghost" id="skip">Skip and start everyone at 30%</button>` : ""}<span class="tiny muted" id="count">0 of ${d.items.length} answered</span></div>
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll(".quiz-q").forEach((qel) => qel.querySelectorAll(".opt").forEach((b) => b.onclick = () => {
        qel.querySelectorAll(".opt").forEach((x) => x.classList.toggle("on", x === b));
        answers[qel.dataset.q] = b.dataset.k === "unsure" ? null : Number(b.dataset.k);
        root.querySelector("#count").textContent = `${Object.keys(answers).length} of ${d.items.length} answered`;
      }));
      root.querySelector("#finish").onclick = async (e) => {
        if (Object.keys(answers).length < d.items.length && !confirm("Unanswered questions count as 'Not sure yet'. Finish anyway?")) return;
        busy(e.currentTarget, true);
        try {
          const res = await api(`/api/profiles/${session.id}/diagnostic/${domain}`, { method: "POST", body: { answers } });
          root.innerHTML = resultHtml(domain, d, res.result, res.recommendation);
          bindResult(root);
        } catch (err) { toast(err.message); busy(e.currentTarget, false); }
      };
      const skip = root.querySelector("#skip");
      if (skip) skip.onclick = async () => {
        const ep = await api(`/api/profiles/${session.id}/episodes`, { method: "POST", body: { domain } });
        location.hash = `#/lessons/${ep.id}`;
      };
    },
  };
}

function resultHtml(domain, d, result, rec) {
  return `
    <div class="crumbs"><a href="#/assessments">Assessments</a>/<span>Diagnostic result</span></div>
    <div class="page-head" style="margin-top:-12px"><div><h1>Your starting point</h1><p class="muted">${esc(domainName(domain))}. These are your starting mastery estimates. Every scenario you finish updates them.</p></div></div>
    <div class="card" style="max-width:820px"><table class="tbl"><thead><tr><th>Skill</th><th>Your answer</th><th>Starting mastery</th></tr></thead><tbody>
      ${Object.entries(result).map(([sk, r]) => `<tr><td>${esc(d.skills[sk])}</td><td>${r.correct === null ? "Not sure" : r.correct ? '<span class="tag dark">Correct</span>' : '<span class="tag">Incorrect</span>'}</td><td><b style="font-weight:500">${pct(r.mastery)}</b></td></tr>`).join("")}
    </tbody></table></div>
    ${rec?.scenario ? `<div class="card stack" style="max-width:820px;gap:10px"><h3>First recommended scenario: ${esc(rec.scenario.title)}</h3>${reasonList(rec.reasons)}</div>` : ""}
    <div><button class="btn primary lg" data-go="${domain}">${icon("play", "sm")}Start practising</button></div>`;
}

function bindResult(root) {
  const b = root.querySelector("[data-go]");
  if (b) b.onclick = async () => {
    const ep = await api(`/api/profiles/${session.id}/episodes`, { method: "POST", body: { domain: b.dataset.go } });
    location.hash = `#/lessons/${ep.id}`;
  };
}
