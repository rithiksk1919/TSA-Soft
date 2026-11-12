import { api, session } from "../api.js";
import { icon, esc, modal, toast } from "../ui.js";
import { profilePicker } from "../app.js";

export async function render() {
  const h = await api("/api/health");
  const html = `
    <div class="page-head"><div><h1>Settings</h1><p class="muted">Local profile, coach and demo data.</p></div></div>
    <div class="grid g2">
      <div class="card stack" style="gap:12px"><h3>Profile</h3><p class="small">Signed in as <b>${esc(session.profile.name)}</b>${session.profile.is_demo ? ' <span class="tag">Demo</span>' : ""}. Profiles are names stored in the local SQLite database. There are no passwords.</p>
        <div class="row"><button class="btn" id="switch">${icon("users", "sm")}Switch profile</button><button class="btn" id="del">${icon("x", "sm")}Delete this profile</button></div></div>
      <div class="card stack" style="gap:12px"><h3>Coach</h3>
        <p class="small">The coach explains your mistakes from your recorded attempts, hints and the evaluator's verified result. It works fully offline.</p>
        <p class="tiny muted">Correctness is always decided by the deterministic evaluator. The coach only explains it.</p></div>
      <div class="card stack" style="gap:12px"><h3>Code sandbox</h3><p class="small">Learner code runs in a separate Python process with a timeout, an empty environment, and no network. OS sandbox: <b>${esc(h.sandbox)}</b>.</p></div>
      <div class="card stack" style="gap:12px"><h3>Demo mode</h3><p class="small">Recreates two demo learners, Priya and Marcus. They make different mistakes on the same first scenario, so the engine sends them to different next scenarios.</p>
        <div><button class="btn primary" id="demo">${icon("refresh", "sm")}Reset demo learners</button></div></div>
    </div>`;
  return {
    html,
    mount(root) {
      root.querySelector("#switch").onclick = () => profilePicker(true);
      root.querySelector("#demo").onclick = async (e) => {
        e.target.disabled = true;
        try {
          const r = await api("/api/demo/reset", { method: "POST" });
          const [a, b] = Object.entries(r);
          modal(`<h3>Demo learners ready</h3><p class="small">Both started on <b>${esc(a[1].first)}</b> and made different mistakes:</p>
            <div class="stack small"><div class="reason"><b>${esc(a[0])}</b> → next: ${esc(a[1].next)} (${esc(a[1].next_skill)})<br>${esc(a[1].reasons[0])}</div><div class="reason"><b>${esc(b[0])}</b> → next: ${esc(b[1].next)} (${esc(b[1].next_skill)})<br>${esc(b[1].reasons[0])}</div></div>
            <div class="row" style="justify-content:flex-end"><button class="btn primary" id="pick">Choose a profile</button></div>`, { onMount: (el, close) => el.querySelector("#pick").onclick = () => { close(); profilePicker(true); } });
        } catch (err) { toast(err.message); }
        e.target.disabled = false;
      };
      root.querySelector("#del").onclick = () => modal(`<h3>Delete ${esc(session.profile.name)}?</h3><p class="small muted">This permanently removes the profile and all its recorded practice from this computer.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Cancel</button><button class="btn primary" id="yes">Delete</button></div>`,
        { onMount: (el, close) => el.querySelector("#yes").onclick = async () => { await api(`/api/profiles/${session.id}`, { method: "DELETE" }); session.id = null; close(); location.hash = "#/"; location.reload(); } });
    },
  };
}
