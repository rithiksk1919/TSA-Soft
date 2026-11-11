import { api, session, loadCatalog } from "./api.js";
import { go } from "./app.js";
import { toast } from "./ui.js";

// Start (or resume) practice. On first use of a domain, send the learner to the diagnostic.
export async function startPractice({ domain, scenario_id, skill } = {}, btn) {
  const pid = session.id;
  try {
    if (btn) btn.disabled = true;
    const cat = await loadCatalog(true);
    const dom = domain || cat.scenarios.find((s) => s.id === scenario_id)?.domain;
    const diag = await api(`/api/profiles/${pid}/diagnostic/${dom}`);
    const started = cat.scenarios.some((s) => s.domain === dom && s.status !== "new");
    if (!diag.status && !started && !scenario_id) {
      go(`#/diagnostic/${dom}?then=practice`);
      return;
    }
    const ep = await api(`/api/profiles/${pid}/episodes`, { method: "POST", body: { domain: dom, scenario_id, skill } });
    go(`#/lessons/${ep.id}`);
  } catch (err) {
    toast(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function bindStarts(root) {
  root.querySelectorAll("[data-start]").forEach((b) => b.addEventListener("click", (e) => {
    e.preventDefault();
    const d = b.dataset;
    startPractice({ domain: d.domain || undefined, scenario_id: d.scenario || undefined, skill: d.skill || undefined }, b);
  }));
}
