import { api, session } from "../api.js";
import { icon, esc } from "../ui.js";

const kb = (n) => (n == null ? "–" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const ficon = (t) => (t.startsWith("PNG") ? "image" : t.startsWith("Python") ? "code" : "file");

export async function render() {
  const items = await api(`/api/downloads?profile=${session.id}`);
  const selected = new Set();
  let tab = "all", q = "", page = 0;
  const PER = 8;
  const groups = { all: items, data: items.filter((i) => i.kind === "Your data"), starter: items.filter((i) => i.kind === "Starter file"), plots: items.filter((i) => i.kind === "Simulation plot") };

  const html = `
    <div class="page-head"><div><h1>Downloads</h1><p class="muted">Your learning toolkit: your own data exports, starter files, and the engine's evaluation plots.</p></div><button class="btn primary" id="dl-sel">${icon("download", "sm")}Download selected</button></div>
    <div class="tabs" id="dtabs"><button data-t="all">All resources (${groups.all.length})</button><button data-t="data">Your data (${groups.data.length})</button><button data-t="starter">Starter files (${groups.starter.length})</button><button data-t="plots">Simulation plots (${groups.plots.length})</button></div>
    <div class="row between"><label class="search" style="margin:0;width:260px;background:#fff;border:1px solid #e2e2e2">${icon("search", "sm")}<input id="q" placeholder="Search resources"></label><span class="tiny muted" id="cnt"></span></div>
    <div class="card" style="padding:8px 14px"><table class="tbl"><thead><tr><th style="width:30px"></th><th>Resource name</th><th>Course</th><th>Size</th><th>Type</th><th></th></tr></thead><tbody id="rows"></tbody></table>
      <div class="row between" style="padding:12px 4px 6px"><span class="tiny muted" id="selinfo">0 files selected</span><div class="row" id="pager"></div></div></div>
    ${groups.plots.length ? "" : `<div class="notice">${icon("chart")}<div><b>No simulation plots yet.</b><div class="tiny muted">Run <code class="code-inline">python3 sim/simulate.py</code> to simulate 120 synthetic learners. The plots appear here.</div></div></div>`}
    <div><h2 style="margin-bottom:14px">Everything you need, bundled</h2><div class="grid g3">
      <a class="card stack" href="/api/profiles/${session.id}/export.json" download><span class="row">${icon("file")}<b style="font-weight:500">Full data export</b></span><span class="tiny muted">Every action, attempt, mastery update and selection reason as JSON.</span></a>
      <div class="card stack"><span class="row">${icon("code")}<b style="font-weight:500">Python starter pack</b></span><span class="tiny muted">${groups.starter.length} buggy starter files to practise offline.</span><button class="btn sm" id="dl-starters" style="align-self:flex-start">${icon("download", "sm")}Download all</button></div>
      <div class="card stack"><span class="row">${icon("chart")}<b style="font-weight:500">Engine evaluation</b></span><span class="tiny muted">${groups.plots.length} plots from the synthetic-learner simulation.</span><button class="btn sm" id="dl-plots" style="align-self:flex-start" ${groups.plots.length ? "" : "disabled"}>${icon("download", "sm")}Download all</button></div>
    </div></div>`;

  const trigger = (list) => list.forEach((it, i) => setTimeout(() => { const a = document.createElement("a"); a.href = it.url; a.download = it.name; document.body.appendChild(a); a.click(); a.remove(); }, i * 250));

  return {
    html,
    mount(root) {
      const draw = () => {
        root.querySelectorAll("#dtabs button").forEach((b) => b.classList.toggle("active", b.dataset.t === tab));
        const list = groups[tab].filter((i) => (i.name + i.desc + i.course).toLowerCase().includes(q));
        const pages = Math.max(1, Math.ceil(list.length / PER));
        page = Math.min(page, pages - 1);
        root.querySelector("#cnt").textContent = `${list.length} of ${items.length} resources`;
        root.querySelector("#rows").innerHTML = list.slice(page * PER, page * PER + PER).map((it) => `
          <tr><td><input type="checkbox" data-id="${it.id}" ${selected.has(it.id) ? "checked" : ""}></td>
            <td><div class="row"><span class="tile-icon" style="width:32px;height:32px">${icon(ficon(it.type), "sm")}</span><div><div style="font-weight:500">${esc(it.name)}</div><div class="tiny muted">${esc(it.desc)}</div></div></div></td>
            <td>${esc(it.course)}<div class="tiny muted">${esc(it.kind)}</div></td><td>${kb(it.size)}</td><td><span class="tag">${esc(it.type)}</span></td>
            <td style="text-align:right"><a class="icon-btn" href="${it.url}" download="${esc(it.name)}" title="Download">${icon("download", "sm")}</a></td></tr>`).join("") || '<tr><td colspan="6"><div class="empty">No resources match.</div></td></tr>';
        root.querySelector("#pager").innerHTML = `<button class="icon-btn" data-p="-1">${icon("chevLeft", "sm")}</button>${Array.from({ length: pages }, (_, i) => `<button class="icon-btn ${i === page ? "boxed" : ""}" data-pg="${i}">${i + 1}</button>`).join("")}<button class="icon-btn" data-p="1">${icon("chevRight", "sm")}</button>`;
        root.querySelectorAll("[data-pg]").forEach((b) => b.onclick = () => { page = Number(b.dataset.pg); draw(); });
        root.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => { page = Math.max(0, Math.min(pages - 1, page + Number(b.dataset.p))); draw(); });
        root.querySelectorAll("[data-id]").forEach((c) => c.onchange = () => { c.checked ? selected.add(c.dataset.id) : selected.delete(c.dataset.id); root.querySelector("#selinfo").textContent = `${selected.size} file${selected.size === 1 ? "" : "s"} selected`; });
        root.querySelector("#selinfo").textContent = `${selected.size} file${selected.size === 1 ? "" : "s"} selected`;
      };
      root.querySelectorAll("#dtabs button").forEach((b) => b.onclick = () => { tab = b.dataset.t; page = 0; draw(); });
      root.querySelector("#q").oninput = (e) => { q = e.target.value.toLowerCase(); page = 0; draw(); };
      root.querySelector("#dl-sel").onclick = () => trigger(items.filter((i) => selected.has(i.id)));
      root.querySelector("#dl-starters").onclick = () => trigger(groups.starter);
      root.querySelector("#dl-plots").onclick = () => trigger(groups.plots);
      draw();
    },
  };
}
