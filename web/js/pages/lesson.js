import { api, session, loadCatalog, skillName } from "../api.js";
import { icon, esc, pct, bar, dur, relTime, toast, busy, modal, modeLabel, diffLabel, domainIcon, statusTag, reasonList } from "../ui.js";
import { createEditor } from "../editor.js";
import { schematic, MODE_INFO, fmtValue } from "../circuit.js";
import { startPractice, bindStarts } from "../actions.js";
import { go } from "../app.js";

export async function render({ args }) {
  if (!args[0]) return landing();
  const ep = await api(`/api/episodes/${args[0]}`);
  if (ep.profile_id !== session.id) return { html: '<div class="empty">This scenario belongs to another profile.</div>' };
  const cat = await loadCatalog(true);
  return player(ep, cat);
}

async function landing() {
  const d = await api(`/api/profiles/${session.id}/dashboard`);
  const html = `
    <div class="page-head"><div><h1>Lessons</h1><p class="muted">Every lesson is a hands-on scenario picked for you by the adaptive engine.</p></div></div>
    <div class="grid g2">${d.domains.map((dm) => `
      <div class="card stack" style="gap:12px"><div class="row"><span class="tile-icon">${domainIcon(dm.id)}</span><h3 class="grow">${esc(dm.name)}</h3></div>
        ${dm.active_episode ? `<p class="small">In progress: <b>${esc(dm.active_title)}</b></p><div><a class="btn primary" href="#/lessons/${dm.active_episode}">${icon("play", "sm")}Resume</a></div>`
          : `<p class="small muted">Next up: <b style="color:#121212">${esc(dm.recommendation.scenario?.title || "nothing left")}</b> (${esc(dm.recommendation.skill_name || "")})</p><div><button class="btn primary" data-start data-domain="${dm.id}">${icon("play", "sm")}Start next lesson</button></div>`}
      </div>`).join("")}</div>`;
  return { html, mount: bindStarts };
}

function player(ep, cat) {
  const sc = ep.scenario, ev = sc.evaluator, isCode = ev.type === "python_tests";
  const active = ep.status === "active";
  const domainScen = cat.scenarios.filter((s) => s.domain === ep.domain);
  const domSkills = cat.skills.filter((s) => s.domain === ep.domain);
  const solvedCount = domainScen.filter((s) => s.status === "solved").length;
  const showWorked = ep.worked_example && !ep.worked_example_viewed && active;

  const outline = domSkills.map((sk, i) => {
    const items = domainScen.filter((s) => s.skills[0] === sk.id);
    const open = items.some((s) => s.id === sc.id) || i === 0;
    return `<div class="grp"><span>${String(i + 1).padStart(2, "0")} · ${esc(sk.name)}</span>${icon(open ? "chevUp" : "chevDown", "sm")}</div>
      <div class="${open ? "" : "hidden"}">${items.map((s) => {
        const ic = s.status === "solved" ? "badge" : s.status === "failed" ? "x" : s.id === sc.id ? "target" : "play";
        return `<a href="#" class="${s.id === sc.id ? "cur" : ""}" data-open="${s.id}">${icon(ic, "sm")}<span class="grow">${esc(s.title)}<div class="sub">difficulty ${s.difficulty.toFixed(2)} · ${diffLabel(s.difficulty)}</div></span></a>`;
      }).join("")}</div>`;
  }).join("");

  const sel = ep.selection;
  const why = `
    <div class="card"><div class="row between" style="margin-bottom:10px"><h3>Why this scenario</h3><span class="tag">${modeLabel(sel.mode)}</span></div>
      ${sel.skill ? `<div class="kv" style="margin-bottom:10px"><span>${icon("target", "sm")}${esc(skillName(sel.skill))}</span><span>priority ${sel.priority.toFixed(2)}</span><span>target ${sel.target_difficulty.toFixed(2)}</span><span>this one ${sc.difficulty.toFixed(2)}</span></div>` : ""}
      ${ep.transfer_skills.length ? `<div class="notice" style="margin-bottom:8px">${icon("sparkle")}<div><b>Transfer check</b> for ${ep.transfer_skills.map((s) => esc(skillName(s))).join(", ")}: a new surface form you haven't seen. Solve it without hints to count towards mastery.</div></div>` : ""}
      <div class="stack">${reasonList(sel.reasons)}</div>
      <details style="margin-top:10px"><summary class="link" style="cursor:pointer">All skill priorities</summary>
        <table class="tbl" style="margin-top:8px"><thead><tr><th>Skill</th><th>m</th><th>err</th><th>prio</th></tr></thead><tbody>
        ${(sel.skills_considered || []).map((s) => `<tr><td>${esc(skillName(s.skill))}${s.blocked_by.length ? " " + icon("lock", "sm") : ""}${s.mastered ? " ✓" : ""}</td><td>${s.mastery.toFixed(2)}</td><td>${s.error_rate.toFixed(2)}</td><td>${s.priority.toFixed(2)}</td></tr>`).join("")}
        </tbody></table></details>
    </div>`;

  const html = `
    <div class="crumbs"><a href="#/courses">My courses</a>/<a href="#/courses?domain=${ep.domain}">${esc(ep.domain_name)}</a>/<span>${esc(sc.title)}</span></div>
    <div class="page-head" style="margin-top:-12px">
      <div><h1>${esc(sc.title)}</h1><p class="muted small">${esc(ep.domain_name)} · ${sc.skills.map((s) => esc(skillName(s))).join(", ")} · difficulty ${sc.difficulty.toFixed(2)} (${diffLabel(sc.difficulty)}) · ~${sc.estimated_minutes} min</p></div>
      <a class="btn" href="#/challenges?domain=${ep.domain}">${icon("list", "sm")}All lessons</a>
    </div>
    <div class="split">
      <div class="stack" style="gap:18px">
        <div id="worked" class="${showWorked ? "" : "hidden"}"></div>
        <div class="player ${showWorked ? "hidden" : ""}" id="player">
          <div class="player-head"><span>SkillBridge / ${esc(ep.domain_name)}</span><span id="attempt-label"></span></div>
          <div id="workspace"></div>
          <div class="player-foot" id="foot"></div>
        </div>
        <div id="banner"></div>
        <div class="tabs" id="tabs"></div>
        <div id="tabbody"></div>
      </div>
      <div class="stack" style="gap:18px">
        <div class="card"><div class="row between"><h3>Course content</h3>${icon("list", "sm")}</div>
          <div class="tiny muted" style="margin:6px 0 8px">${solvedCount} of ${domainScen.length} scenarios solved</div>${bar(solvedCount / domainScen.length)}
          <div class="outline" style="margin-top:8px">${outline}</div></div>
        ${why}
      </div>
    </div>`;

  return { html, mount: (root) => mountPlayer(root, ep) };
}

function mountPlayer(root, ep) {
  const sc = ep.scenario, ev = sc.evaluator, isCode = ev.type === "python_tests";
  let state = ep;
  let tab = "overview";
  let editor = null;
  const bench = { mode: (ev.meter || [])[0] || null, red: null, black: null, selected: null, last: null };
  let editTimer = null;

  // course outline: collapse + open another scenario
  root.querySelectorAll(".outline .grp").forEach((g) => g.addEventListener("click", () => g.nextElementSibling.classList.toggle("hidden")));
  root.querySelectorAll("[data-open]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    if (a.dataset.open === sc.id) return;
    const go2 = () => startPractice({ scenario_id: a.dataset.open });
    if (state.status === "active" && (state.attempts || state.hints_used)) {
      modal(`<h3>Leave this scenario?</h3><p class="small muted">You have already submitted or used a hint, so leaving counts as not solved for ${sc.skills.map((s) => esc(skillName(s))).join(", ")}.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Stay</button><button class="btn primary" id="leave">Leave</button></div>`,
        { onMount: (el, close) => el.querySelector("#leave").onclick = () => { close(); go2(); } });
    } else go2();
  }));

  // worked example (remedial mode)
  if (state.worked_example) {
    const w = state.worked_example;
    root.querySelector("#worked").innerHTML = `
      <div class="card worked stack" style="gap:14px">
        <div class="row"><span class="tag dark">Worked example first</span><span class="small muted">You missed ${esc(w.skill_name)} twice in a row, so here is a solved example before you try an easier one.</span></div>
        <h2>${esc(w.title)}</h2>
        <div class="grid g2"><div><div class="upper" style="margin-bottom:6px">Before</div><pre>${esc(w.before)}</pre></div><div><div class="upper" style="margin-bottom:6px">After</div><pre>${esc(w.after)}</pre></div></div>
        <ol>${w.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
        <div><button class="btn primary" id="wx-done">${icon("check", "sm")}Got it, start the scenario</button></div>
      </div>`;
    const done = root.querySelector("#wx-done");
    if (done) done.onclick = async () => {
      if (state.status === "active") await api(`/api/episodes/${state.id}/actions`, { method: "POST", body: { type: "worked_example", payload: {} } });
      root.querySelector("#worked").classList.add("hidden");
      root.querySelector("#player").classList.remove("hidden");
    };
  }

  // ---------- workspace ----------
  const ws = root.querySelector("#workspace");
  if (isCode) {
    ws.innerHTML = `<div id="ed"></div>
      <div class="scratch"><label>Run with</label><input id="snippet" value="${esc(ev.sample || "")}" spellcheck="false"><button class="btn sm" id="run" style="background:transparent;color:#eee;border-color:#555">${icon("play", "sm")}Run</button></div>
      <div class="console" id="console"><span style="color:#888">Output appears here. "Run" executes your code plus the line above. "Run tests" grades it against the hidden tests.</span></div>`;
    editor = createEditor(ws.querySelector("#ed"), state.code || sc.starter, {
      readOnly: state.status !== "active",
      onChange: (v) => {
        clearTimeout(editTimer);
        editTimer = setTimeout(() => { if (state.status === "active") api(`/api/episodes/${state.id}/actions`, { method: "POST", body: { type: "edit", payload: { code: v } } }).catch(() => {}); }, 1500);
      },
    });
    ws.querySelector("#run").onclick = async (e) => {
      const btn = e.currentTarget;
      if (state.status !== "active") return toast("This scenario is finished.");
      busy(btn, true);
      try {
        const r = await api(`/api/episodes/${state.id}/actions`, { method: "POST", body: { type: "run", payload: { code: editor.value, snippet: ws.querySelector("#snippet").value } } });
        const c = ws.querySelector("#console");
        c.innerHTML = (r.stdout ? esc(r.stdout) : '<span style="color:#888">(no output)</span>') + (r.error ? `\n<span class="err">${esc(r.error.type)}: ${esc(r.error.message)}${r.error.line ? ` (line ${r.error.line})` : ""}</span>` : "");
        if (r.error?.line) editor.setErrorLine(r.error.line);
      } catch (err) { toast(err.message); }
      busy(btn, false);
    };
  } else if (ev.type === "circuit_fault") {
    ws.innerHTML = `<div class="bench"><div class="schematic" id="schem"></div><div class="meter" id="meter"></div></div>`;
    drawBench();
  } else {
    ws.innerHTML = `<div class="bench" style="grid-template-columns:1fr"><div class="schematic" id="schem"></div></div>`;
    ws.querySelector("#schem").innerHTML = schematic(ev.circuit, {});
  }

  function drawBench() {
    const s = ws.querySelector("#schem");
    s.innerHTML = schematic(ev.circuit, bench);
    s.querySelectorAll("[data-node]").forEach((n) => n.addEventListener("click", () => {
      if (bench.mode !== "voltage") return toast("Switch to the voltage mode to probe nodes.");
      if (!bench.red || bench.black) { bench.red = n.dataset.node; bench.black = null; drawBench(); return; }
      bench.black = n.dataset.node; drawBench(); measure({ mode: "voltage", red: bench.red, black: bench.black });
    }));
    s.querySelectorAll("[data-comp]").forEach((c) => c.addEventListener("click", (e) => {
      if (e.target.closest("[data-node]")) return;
      if (bench.mode === "voltage") return toast("In voltage mode, click two nodes (dots). Switch to mA or Ω to click a part.");
      bench.selected = c.dataset.comp; drawBench(); measure({ mode: bench.mode, component: c.dataset.comp });
    }));
    const m = ws.querySelector("#meter");
    const readings = state.measurements.slice().reverse();
    m.innerHTML = `
      <div class="row between"><span class="upper" style="color:#aaa">Multimeter</span>${icon("meter", "sm")}</div>
      <div class="lcd"><small>${bench.mode ? MODE_INFO[bench.mode].name : "no meter"}${bench.last ? " · " + esc(bench.last.red ? bench.last.red + "→" + bench.last.black : bench.last.component) : ""}</small>${bench.last ? esc(bench.last.display) : "– – –"}</div>
      <div class="modes">${["voltage", "current", "resistance"].map((k) => `<button data-mode="${k}" class="${bench.mode === k ? "on" : ""}" ${ev.meter.includes(k) ? "" : "disabled title='Not available on this bench'"}>${MODE_INFO[k].label}</button>`).join("")}</div>
      <div class="help">${bench.mode ? MODE_INFO[bench.mode].help : ""}${bench.mode === "voltage" ? `<br><span style="color:#ff8a80">●</span> red ${bench.red || "–"} &nbsp; <span>●</span> black ${bench.black || "–"}` : ""}</div>
      <div class="upper" style="color:#888">Readings (${readings.length})</div>
      <div class="readings">${readings.map((r) => `<div>${esc(r.red ? `V ${r.red}→${r.black}` : `${r.mode === "current" ? "I" : "R"} ${r.component}`)}: <b style="color:#fff">${esc(r.display)}</b></div>`).join("") || '<span style="color:#777">No readings yet.</span>'}</div>`;
    m.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { bench.mode = b.dataset.mode; bench.red = bench.black = bench.selected = null; drawBench(); }));
  }

  async function measure(payload) {
    if (state.status !== "active") return toast("This scenario is finished.");
    try {
      const r = await api(`/api/episodes/${state.id}/actions`, { method: "POST", body: { type: "measure", payload } });
      bench.last = r;
      state.measurements.push(r);
      drawBench();
    } catch (err) { toast(err.message); }
  }

  // ---------- footer controls ----------
  function drawFoot() {
    const f = root.querySelector("#foot");
    root.querySelector("#attempt-label").textContent = state.status === "active" ? `Attempt ${state.attempts + 1} of ${state.max_attempts}` : state.status === "solved" ? "Solved" : "Finished";
    if (state.status !== "active") {
      f.innerHTML = `<span class="small" style="color:#aaa">${state.attempts} attempt${state.attempts === 1 ? "" : "s"} · ${state.hints_used} hint${state.hints_used === 1 ? "" : "s"} · ${dur(state.active_seconds)} active</span><span class="grow"></span>
        <button class="btn primary" data-start data-domain="${state.domain}">${icon("arrowRight", "sm")}Next recommended</button>`;
      bindStarts(f);
      return;
    }
    const left = sc.hint_count - state.hints_used;
    let submitUi = "";
    if (isCode) submitUi = `<button class="btn primary" id="submit">${icon("check", "sm")}Run tests</button>`;
    else if (ev.type === "circuit_fault") {
      const parts = ev.circuit.components.filter((c) => c.type !== "battery");
      submitUi = `<select id="d-comp" class="btn" style="background:#1a1a1a"><option value="">Faulty part…</option>${parts.map((c) => `<option value="${c.id}">${c.id}${c.type === "wire" ? " (wire)" : " " + fmtValue(c)}</option>`).join("")}</select>
        <select id="d-kind" class="btn" style="background:#1a1a1a"><option value="">Fault…</option><option value="open">Open</option><option value="short">Short</option><option value="wrong_value">Wrong value</option></select>
        <input id="d-val" class="btn hidden" style="background:#1a1a1a;width:120px" placeholder="actual Ω" inputmode="decimal">
        <button class="btn primary" id="submit">${icon("check", "sm")}Submit diagnosis</button>`;
    } else {
      submitUi = `<span class="small" style="color:#ccc">${esc(ev.question.text)} =</span><input id="c-val" class="btn" style="background:#1a1a1a;width:110px" inputmode="decimal" placeholder="value"><span class="small" style="color:#ccc">${esc(ev.question.unit)}</span><button class="btn primary" id="submit">${icon("check", "sm")}Check answer</button>`;
    }
    f.innerHTML = `<button class="btn" id="hint" ${left ? "" : "disabled"}>${icon("bulb", "sm")}Hint (${left} left)</button>
      ${isCode ? `<button class="btn" id="reset" title="Restore the original buggy code">${icon("refresh", "sm")}Reset</button>` : ""}
      <button class="btn ghost" id="giveup" style="border:0">Give up</button><span class="grow"></span>${submitUi}`;
    f.querySelector("#hint").onclick = async (e) => {
      const btn = e.currentTarget;
      busy(btn, true);
      try { const h = await api(`/api/episodes/${state.id}/hint`, { method: "POST" }); toast(`Hint ${h.hint_no}: ${h.text}`, 6000); tab = "hints"; await refresh(); }
      catch (err) { toast(err.message); busy(btn, false); }
    };
    const reset = f.querySelector("#reset");
    if (reset) reset.onclick = () => { editor.value = sc.starter; api(`/api/episodes/${state.id}/actions`, { method: "POST", body: { type: "edit", payload: { code: sc.starter, reset: true } } }); };
    f.querySelector("#giveup").onclick = () => modal(`<h3>Give up on this scenario?</h3><p class="small muted">It counts as not solved, and you'll see the solution and an explanation. The engine will pick something easier for this skill next.</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Keep trying</button><button class="btn primary" id="gu">Show solution</button></div>`,
      { onMount: (el, close) => el.querySelector("#gu").onclick = async () => { close(); const r = await api(`/api/episodes/${state.id}/give_up`, { method: "POST" }); await refresh(r); } });
    const kind = f.querySelector("#d-kind");
    if (kind) kind.onchange = () => f.querySelector("#d-val").classList.toggle("hidden", kind.value !== "wrong_value");
    f.querySelector("#submit").onclick = async (e) => {
      const btn = e.currentTarget;
      let body;
      if (isCode) { clearTimeout(editTimer); body = { code: editor.value }; }
      else if (ev.type === "circuit_fault") {
        body = { component: f.querySelector("#d-comp").value, kind: f.querySelector("#d-kind").value, value: f.querySelector("#d-val").value };
        if (!body.component || !body.kind) return toast("Choose the faulty part and the fault type.");
      } else body = { value: f.querySelector("#c-val").value };
      busy(btn, true, isCode ? "Running tests…" : "");
      try {
        const r = await api(`/api/episodes/${state.id}/submit`, { method: "POST", body });
        tab = "results";
        if (isCode && r.result.error?.line) editor.setErrorLine(r.result.error.line);
        if (!r.finished) toast(r.result.passed ? "Passed!" : `Not yet: ${r.result.n_passed}/${r.result.total} checks passed.`);
        await refresh(r.finished ? r : null);
      } catch (err) { toast(err.message); busy(btn, false); }
    };
  }

  // ---------- result banner ----------
  let lastFinish = null;
  function drawBanner() {
    const b = root.querySelector("#banner");
    if (state.status === "active") { b.innerHTML = ""; return; }
    const ch = state.mastery_changes || {};
    const next = lastFinish?.next;
    b.innerHTML = `
      <div class="result-banner ${state.status === "solved" ? "solved" : ""}">
        <span class="tile-icon" style="${state.status === "solved" ? "background:#fff;color:#111" : ""}">${icon(state.status === "solved" ? "award" : "flag")}</span>
        <div class="grow"><div style="font-weight:500;font-size:15px">${state.status === "solved" ? "Solved" : "Not solved this time"} · attempt score ${pct(state.score)}</div>
          <div class="row wrap small" style="margin-top:4px;gap:14px">${Object.entries(ch).map(([k, [a, z]]) => `<span>${esc(skillName(k))} <span class="delta ${z >= a ? "up" : "down"}">${pct(a)} → ${pct(z)}</span></span>`).join("")}</div>
          ${lastFinish?.newly_mastered?.length ? `<div class="small" style="margin-top:6px">${icon("sparkle", "sm")} Mastered: ${lastFinish.newly_mastered.map((s) => esc(skillName(s))).join(", ")}</div>` : ""}
          ${next?.scenario ? `<div class="small muted" style="margin-top:6px">Next: <b>${esc(next.scenario.title)}</b>. ${esc(next.reasons[0])}</div>` : ""}
        </div>
      </div>`;
  }

  // ---------- tabs ----------
  function drawTabs() {
    const tabs = [["overview", "Overview"], ["hints", `Hints (${state.hints_used})`], ["results", `Results (${state.submissions.length})`], ["coach", "Coach"], ["activity", `Activity (${state.activity.length})`]];
    if (state.status !== "active") tabs.splice(1, 0, ["solution", "Solution"]);
    root.querySelector("#tabs").innerHTML = tabs.map(([k, l]) => `<button class="${tab === k ? "active" : ""}" data-tab="${k}">${l}</button>`).join("");
    root.querySelectorAll("#tabs button").forEach((b) => b.onclick = () => { tab = b.dataset.tab; drawTabs(); drawTabBody(); });
  }

  function testRow(t) {
    const detail = t.visible ? `<div class="tiny muted" style="margin-top:4px"><code>${esc(t.input)}</code> → expected <code>${esc(JSON.stringify(t.expected))}</code>${t.got !== undefined ? `, got <code>${esc(JSON.stringify(t.got))}</code>` : ""}</div>` : '<div class="tiny faint" style="margin-top:2px">hidden test: inputs not shown</div>';
    const err = t.error ? `<div class="tiny" style="color:var(--bad);margin-top:3px">${esc(t.error.type)}: ${esc(t.error.message)}${t.error.line ? ` (line ${t.error.line})` : ""}</div>` : "";
    const cls = t.passed === undefined ? "" : t.passed ? "pass" : "fail";
    return `<div class="test ${cls}"><span class="dot">${t.passed === undefined ? "" : icon(t.passed ? "check" : "x")}</span><div class="grow"><div>${esc(t.name)}</div>${detail}${err}</div></div>`;
  }

  async function drawTabBody() {
    const body = root.querySelector("#tabbody");
    if (tab === "overview") {
      let extra = "";
      if (isCode) extra = `<h3 style="margin:18px 0 10px">Checks</h3><div class="test-list">${ev.tests.map((t) => testRow({ ...t, passed: undefined })).join("")}</div>`;
      else extra = `<h3 style="margin:18px 0 10px">Parts list</h3><table class="tbl"><thead><tr><th>Part</th><th>Type</th><th>Label</th><th>Between</th></tr></thead><tbody>${ev.circuit.components.map((c) => `<tr><td>${c.id}</td><td>${c.type}</td><td>${esc(fmtValue(c) || "–")}</td><td>${c.a} – ${c.b}</td></tr>`).join("")}</tbody></table>
        <p class="tiny muted" style="margin-top:8px">Meter on this bench: ${ev.meter.length ? ev.meter.map((m) => MODE_INFO[m].name).join(", ") : "none. Solve it with Ohm's law."}</p>`;
      body.innerHTML = `<h3 style="margin-bottom:8px">Your task</h3><p style="max-width:720px">${esc(sc.prompt)}</p>${extra}`;
    } else if (tab === "hints") {
      body.innerHTML = `<div class="stack" style="gap:8px">${state.hints.map((h, i) => `<div class="hint-item"><b>${i + 1}.</b><span>${esc(h)}</span></div>`).join("") || '<div class="empty">No hints used. Each hint lowers this scenario\'s score by 0.15, so try a Run first.</div>'}</div>
        <p class="tiny muted" style="margin-top:10px">${sc.hint_count - state.hints_used} of ${sc.hint_count} hints left. Hints are ordered from a nudge to a near-answer.</p>`;
    } else if (tab === "results") {
      body.innerHTML = state.submissions.length ? state.submissions.slice().reverse().map((s) => `
        <div class="card flat" style="margin-bottom:12px"><div class="row between" style="margin-bottom:10px"><b style="font-weight:500">Attempt ${s.attempt_no}</b>
          <span class="row">${s.passed ? '<span class="tag dark">Passed</span>' : '<span class="tag bad">Failed</span>'}<span class="tiny faint">${relTime(s.ts)}</span></span></div>
          ${s.result.error ? `<div class="notice" style="margin-bottom:8px">${icon("x")}<div><b>${esc(s.result.error.type)}</b>: ${esc(s.result.error.message)}${s.result.error.line ? ` (line ${s.result.error.line})` : ""}</div></div>` : ""}
          ${s.result.tests ? `<div class="test-list">${s.result.tests.map(testRow).join("")}</div>` : `<p class="small">${esc(s.result.message || "")}</p>${s.payload.component ? `<p class="tiny muted">You said: ${esc(s.payload.component)} is ${esc((s.payload.kind || "").replace("_", " "))}${s.payload.value ? ` (${esc(s.payload.value)} Ω)` : ""}</p>` : s.payload.value != null ? `<p class="tiny muted">You answered ${esc(s.payload.value)} ${esc(ev.question?.unit || "")}</p>` : ""}`}
          ${s.failed_skills.length ? `<div class="row wrap" style="margin-top:10px"><span class="tiny muted">Points to:</span>${s.failed_skills.map((k) => `<span class="tag">${esc(skillName(k))}</span>`).join("")}</div>` : ""}
        </div>`).join("") : '<div class="empty">No attempts yet.</div>';
    } else if (tab === "solution") {
      const sol = state.solution;
      body.innerHTML = `<div class="stack" style="gap:12px"><div class="notice">${icon("bulb")}<div><b>What was wrong</b><br>${esc(state.explanation)}</div></div>
        ${isCode ? `<div class="worked"><pre style="border-radius:0">${esc(sol)}</pre></div>` : sol.component ? `<p>Fault: <b>${esc(sol.component)}</b> is <b>${esc(sol.kind.replace("_", " "))}</b>${sol.actual ? ` (actually ${fmtValue({ type: "resistor", value: sol.actual })})` : ""}.</p>` : `<p>Answer: <b>${sol.answer} ${esc(sol.unit)}</b></p>`}</div>`;
    } else if (tab === "coach") {
      if (!state.submissions.length && state.status === "active") { body.innerHTML = '<div class="empty">The coach explains your mistakes after you submit an attempt.</div>'; return; }
      body.innerHTML = state.coach ? coachHtml(state.coach) : `<div class="row"><button class="btn primary" id="ask">${icon("sparkle", "sm")}Get coach feedback</button><span class="tiny muted">Built from your recorded attempts and the evaluator's verified result.</span></div>`;
      const ask = body.querySelector("#ask");
      if (ask) ask.onclick = () => loadCoach(ask);
      const re = body.querySelector("#re-ask");
      if (re) re.onclick = () => loadCoach(re, true);
    } else if (tab === "activity") {
      const label = { start: "Started", edit: "Edited code", run: "Ran code", measure: "Measured", hint: "Used a hint", worked_example: "Read worked example", submit: "Submitted", give_up: "Gave up", abandon: "Left", complete: "Finished", coach: "Coach feedback" };
      const t0 = state.started_at;
      body.innerHTML = `<table class="tbl"><thead><tr><th>Time</th><th>Action</th><th>Detail</th></tr></thead><tbody>${state.activity.slice().reverse().map((a) => {
        const p = a.payload || {};
        const det = a.type === "submit" ? (p.passed ? "passed" : `failed${p.failed_skills?.length ? ": " + p.failed_skills.map(skillName).join(", ") : ""}`)
          : a.type === "measure" ? `${p.red ? `${p.red}→${p.black}` : p.component}: ${p.display}` : a.type === "edit" ? `${p.chars ?? ""} chars` : a.type === "hint" ? `hint ${p.hint_no}`
          : a.type === "run" ? (p.result?.error ? p.result.error.type : "ok") : a.type === "complete" ? `score ${pct(p.score)}` : a.type === "start" ? modeLabel(p.mode) : "";
        return `<tr><td class="mono tiny">+${dur(a.ts - t0)}</td><td>${label[a.type] || a.type}</td><td class="small muted">${esc(det)}</td></tr>`;
      }).join("")}</tbody></table>`;
    }
  }

  function coachHtml(c) {
    const src = `<span class="tag">${icon("sparkle", "sm")}Coach</span>`;
    return `<div class="card coach-box"><div class="row between"><h3>${esc(c.headline)}</h3>${src}</div>
      <div><h4>What happened</h4><p class="small">${esc(c.what_happened)}</p></div>
      <div><h4>Why</h4><p class="small">${esc(c.why)}</p></div>
      <div><h4>Next time</h4><p class="small">${esc(c.next_time)}</p></div>
      <div class="row between"><span class="tiny faint">Correctness comes from the evaluator. The coach only explains it.</span><button class="btn sm" id="re-ask">${icon("refresh", "sm")}Refresh</button></div></div>`;
  }

  async function loadCoach(btn, refreshFb = false) {
    busy(btn, true, "Reading your attempts…");
    try { state.coach = await api(`/api/episodes/${state.id}/coach`, { method: "POST", body: { refresh: refreshFb } }); }
    catch (err) { toast(err.message); }
    drawTabBody();
  }

  async function refresh(finishInfo) {
    if (finishInfo) lastFinish = finishInfo;
    state = await api(`/api/episodes/${state.id}`);
    if (state.status !== "active") {
      if (editor) { const v = editor.value; createEditor(ws.querySelector("#ed"), v, { readOnly: true }); }
      if (finishInfo) {
        await loadCatalog(true);
        if (tab !== "results") tab = "results";
      }
    }
    drawFoot(); drawBanner(); drawTabs(); drawTabBody();
    if (!isCode && ev.type === "circuit_fault") drawBench();
  }

  drawFoot(); drawBanner(); drawTabs(); drawTabBody();
}
