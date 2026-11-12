// The classroom: learn a skill the first time, in a 3D room (classroom3d.js). Three stations:
// the chalkboard (step through the code with memory beside it), the textbook (a two-page spread
// with a page turn) and the listening desk (the lesson read aloud by ElevenLabs, or the browser's
// own voice). Plus the starting diagnostic and "I am ready to practice".
//
// Everything shown comes from the lesson file (content/lessons/<skill>.json); its optional "look"
// sets the subject's name and colour, so a new subject needs only a new file.
import { api, esc, fixed, main, getProfileId, renderTopBar, openPanel, toast, query } from "./common.js";
import { buildClassroom } from "./classroom3d.js";

let lesson = null;
let room = null;
const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

const SUBJECT_LOOKS = {
  python: { subject: "Python", color: "#2D4A6E" },
  circuits: { subject: "Circuits", color: "#7B3F36" }
};

function lookFor(data) {
  const base = SUBJECT_LOOKS[data.domain] || { subject: data.domain || "Lesson", color: "#4F6B45" };
  return Object.assign({}, base, data.look || {});
}

function pickSkill(summary) {
  const params = query();
  if (params.skill) {
    return params.skill;
  }
  if (summary.rooms.classroom.waiting.length > 0) {
    return summary.rooms.classroom.waiting[0].skill;
  }
  if (summary.next_up) {
    return summary.next_up.skill;
  }
  return "py_conditionals";
}

// Plays keyframes; resolves when done. Under reduced motion it jumps to the end.
function animate(el, frames, opts) {
  if (!el || !el.animate || calm.matches) {
    return Promise.resolve();
  }
  return el.animate(frames, opts).finished.catch(function () {});
}

export async function showClassroom(summary) {
  const pid = getProfileId();
  const skill = pickSkill(summary);
  lesson = await api("/api/profiles/" + pid + "/lesson/" + skill);
  const look = lookFor(lesson);
  renderTopBar("classroom", summary, lesson.skill_name + ": mastery " + fixed(lesson.mastery, 2));

  let waitingNote = "";
  for (const item of summary.rooms.classroom.waiting) {
    if (item.skill === skill) {
      waitingNote = '<p class="note" style="margin:6px 0 0">Worked example waiting: you missed this skill twice in a row.</p>';
    }
  }
  let options = "";
  for (const row of summary.skills_table) {
    let selected = "";
    if (row.id === skill) {
      selected = " selected";
    }
    options += '<option value="' + row.id + '"' + selected + ">" + esc(row.name) + "</option>";
  }

  let html = '<div class="scene scene3c"><div class="stage3c" id="stage3c"></div>';
  html += '<div class="chip"><span class="kicker">Learn it first</span><strong>The classroom</strong>';
  html += '<label class="note" for="lesson-pick" style="display:block;margin-top:6px">Lesson</label>';
  html += '<select id="lesson-pick" class="pick">' + options + "</select>";
  html += waitingNote + "</div>";
  html += '<nav class="bar" aria-label="Classroom stations">';
  html += '<button type="button" class="station" data-station="watch" aria-pressed="false"><b>Watch</b>The chalkboard</button>';
  html += '<button type="button" class="station" data-station="read" aria-pressed="false"><b>Read</b>The textbook</button>';
  html += '<button type="button" class="station" data-station="listen" aria-pressed="false"><b>Listen</b>The listening desk</button>';
  if (needsDiagnostic(summary, lesson.domain)) {
    html += '<button type="button" class="station" data-station="diagnostic" aria-pressed="false"><b>Start here</b>The diagnostic</button>';
  }
  html += '<button type="button" class="btn btn-light" id="ready">I am ready to practice</button>';
  html += "</nav></div>";
  main.innerHTML = html;

  if (room) {
    room.destroy();
  }
  const stage = document.getElementById("stage3c");
  room = buildClassroom(stage, lesson, look);
  // Clicking a station in the room opens it, the same as its button in the bar.
  stage.addEventListener("click", function (event) {
    const hit = event.target.closest("[data-station]");
    if (hit) {
      openStation(hit.dataset.station, summary, look);
    }
  });

  document.getElementById("lesson-pick").addEventListener("change", function (event) {
    location.hash = "#/classroom?skill=" + event.target.value;
  });
  for (const button of main.querySelectorAll(".bar [data-station]")) {
    button.addEventListener("click", function () {
      openStation(button.dataset.station, summary, look);
    });
  }
  const readyButton = document.getElementById("ready");
  readyButton.addEventListener("click", async function () {
    readyButton.disabled = true;
    try {
      const episode = await api("/api/profiles/" + pid + "/lesson/" + skill + "/practice", {});
      location.href = "/practice/#/lessons/" + episode.id;
    } catch (error) {
      toast(error.message);
      readyButton.disabled = false;
    }
  });

  if (query().diagnostic) {
    openStation("diagnostic", summary, look);
  }
}

function needsDiagnostic(summary, domain) {
  if (!summary.next_up || summary.next_up.domain !== domain) {
    return false;
  }
  return summary.next_up.action === "take the starting diagnostic";
}

function markStation(name) {
  for (const button of main.querySelectorAll(".bar .station")) {
    button.setAttribute("aria-pressed", String(button.dataset.station === name));
  }
}

let busy = false;
async function openStation(name, summary, look) {
  if (busy) {
    return;
  }
  busy = true;
  markStation(name);
  if (room) {
    room.clearHot();
  }
  if (name !== "diagnostic") {
    api("/api/profiles/" + getProfileId() + "/lesson/" + lesson.skill + "/viewed", { station: name }).catch(function () {});
  }
  try {
    if (name === "diagnostic") {
      await openDiagnostic(lesson.domain);
      return;
    }
    // Fly to the station first, then open it over the room.
    if (room) {
      await room.fly(name);
    }
    if (name === "watch") {
      openChalkboard(look);
    } else if (name === "read") {
      openTextbook(look);
    } else if (name === "listen") {
      openListening(look);
    }
  } finally {
    busy = false;
  }
}

function closed() {
  markStation("");
  if (room) {
    room.fly("overview");
  }
}

/* =====================================================================
   The chalkboard: the code in chalk, a highlight that glides to the line being run, what the
   teacher says about it, and the memory (names and values) after that line.
   ===================================================================== */
function openChalkboard(look) {
  const board = lesson.chalkboard;
  const steps = board.steps;
  let index = 0;
  let auto = 0;
  // A lesson without a line-by-line trace (one built from a worked example) is taught as notes:
  // each step is chalked up under the problem as you reach it. Memory shows only if a step has some.
  const notesMode = steps.every(function (st) {
    return !(st.line >= 0);
  });
  const hasMemory = steps.some(function (st) {
    const m = st.memory || {};
    return Object.keys(m.global || {}).length + Object.keys(m.local || {}).length > 0;
  });

  let code = "";
  for (let i = 0; i < board.code.length; i = i + 1) {
    code += '<li data-line="' + i + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(board.code[i]) + "</span></li>";
  }
  let dots = "";
  for (let i = 0; i < steps.length; i = i + 1) {
    dots += '<button type="button" class="cb-dot" data-step="' + i + '" aria-label="Go to step ' + (i + 1) + '"></button>';
  }
  let notes = "";
  if (notesMode) {
    notes = '<ol class="cb-notes" id="cb-notes">';
    for (let i = 0; i < steps.length; i = i + 1) {
      notes += '<li data-note="' + i + '"><span class="n">' + (i + 1) + '.</span><span class="t">' + esc(steps[i].say) + "</span></li>";
    }
    notes += "</ol>";
  }
  let html = '<div class="cb' + (notesMode ? " cb--notes" : "") + (hasMemory ? "" : " cb--nomem") + '" style="--subject:' + esc(look.color) + '">';
  html += '<header class="cb-head"><span class="kicker">Watch · ' + esc(lesson.skill_name) + '</span><h2 id="cb-title">' + esc(board.title) + "</h2></header>";
  html += '<div class="cb-board"><div class="cb-code"><span class="cb-hl" aria-hidden="true"><i class="cb-hl__now"></i><i class="cb-hl__err"></i></span>';
  html += '<ol id="cb-lines">' + code + "</ol>" + notes + "</div>";
  if (hasMemory) {
    html += '<aside class="cb-mem" aria-label="Memory after this step"><h3>Memory</h3><div id="cb-frames"></div></aside>';
  }
  html += "</div>";
  html += '<div class="cb-say" aria-live="polite"><p id="cb-say"></p></div>';
  html += '<div class="cb-controls"><button type="button" class="btn btn-light" id="cb-back">Back</button>';
  html += '<button type="button" class="btn" id="cb-next">Next step</button>';
  html += '<button type="button" class="btn btn-light" id="cb-auto" aria-pressed="false">Play steps</button>';
  html += '<div class="cb-dots" role="group" aria-label="Steps">' + dots + '</div><span class="note" id="cb-count"></span></div>';
  html += '<p class="cb-keys note">Use the arrow keys to step, Space to play.</p></div>';

  const view = openPanel(html, function () {
    clearInterval(auto);
    document.removeEventListener("keydown", onKey);
    closed();
  }, "panel--board");
  const panel = view.panel;
  const lineEls = panel.querySelectorAll("#cb-lines li");
  const hl = panel.querySelector(".cb-hl");
  const codeBox = panel.querySelector(".cb-code");
  const noteEls = panel.querySelectorAll("#cb-notes li");
  const say = panel.querySelector("#cb-say");
  const frames = panel.querySelector("#cb-frames");
  let shown = { global: {}, local: {} };

  // The lines are chalked up one after another when the board opens.
  lineEls.forEach(function (li, i) {
    animate(li, [{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 260, delay: 60 + i * 45, easing: "ease-out", fill: "backwards" });
  });

  function memoryHtml(label, values, before, local) {
    let out = '<div class="cb-frame' + (local ? " cb-frame--local" : "") + '"><span class="cb-frame__label">' + esc(label) + "</span>";
    const names = Object.keys(values);
    if (names.length === 0) {
      out += '<span class="cb-empty">No names yet</span>';
    }
    for (const name of names) {
      const changed = before[name] !== values[name];
      out += '<div class="cb-var' + (changed ? " is-new" : "") + '"><span class="cb-var__glow"></span><b>' + esc(name) + "</b><span>= " + esc(values[name]) + "</span></div>";
    }
    return out + "</div>";
  }

  function draw(first) {
    const step = steps[index];
    // the highlight glides to the line or note (transform only), stretching to its height; it
    // turns red on the line with the bug
    const li = notesMode ? noteEls[index] : lineEls[step.line];
    if (notesMode) {
      noteEls.forEach(function (n, i) {
        const was = n.classList.contains("is-shown");
        n.classList.toggle("is-shown", i <= index);
        n.classList.toggle("is-now", i === index);
        if (!was && i <= index && !first) {
          animate(n, [{ opacity: 0, transform: "translateX(-8px)" }, { opacity: 1, transform: "none" }], { duration: 320, delay: (i === index ? 120 : 0), easing: "ease-out", fill: "backwards" });
        }
      });
    }
    if (li) {
      const top = li.getBoundingClientRect().top - codeBox.getBoundingClientRect().top + codeBox.scrollTop;
      hl.style.opacity = "1";
      hl.style.transform = "translateY(" + top.toFixed(1) + "px) scaleY(" + (li.offsetHeight / 40).toFixed(3) + ")";
      hl.classList.toggle("is-error", !!step.error);
      if (notesMode && !first) {
        li.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" });
      }
    } else {
      hl.style.opacity = "0";
    }
    lineEls.forEach(function (el, i) {
      el.classList.toggle("is-now", i === step.line);
    });
    // what the teacher says, faded in
    say.parentElement.classList.toggle("is-error", !!step.error);
    say.innerHTML = (step.error ? "<strong>" + esc(step.error_label) + "</strong>" : "") + esc(step.say);
    animate(say, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "ease-out" });
    // memory: new or changed values glow briefly
    const mem = step.memory || { global: {}, local: {} };
    if (frames) frames.innerHTML = memoryHtml("Global (the file)", mem.global || {}, shown.global, false) +
      memoryHtml("Local: " + (board.local_label || "inside the function"), mem.local || {}, shown.local, true);
    if (!first && frames) {
      for (const v of frames.querySelectorAll(".cb-var.is-new")) {
        animate(v, [{ opacity: 0, transform: "translateX(10px)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: "ease-out" });
        animate(v.querySelector(".cb-var__glow"), [{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: "ease-out", fill: "forwards" });
      }
    }
    shown = { global: Object.assign({}, mem.global), local: Object.assign({}, mem.local) };
    panel.querySelectorAll(".cb-dot").forEach(function (d, i) {
      d.classList.toggle("is-done", i < index);
      d.classList.toggle("is-now", i === index);
      d.setAttribute("aria-current", i === index ? "step" : "false");
    });
    panel.querySelector("#cb-count").textContent = "Step " + (index + 1) + " of " + steps.length;
    panel.querySelector("#cb-back").disabled = index === 0;
    panel.querySelector("#cb-next").disabled = index === steps.length - 1;
  }
  function go(i) {
    if (i < 0 || i >= steps.length || i === index) {
      return;
    }
    index = i;
    draw(false);
  }
  function stopAuto() {
    clearInterval(auto);
    auto = 0;
    const b = panel.querySelector("#cb-auto");
    b.textContent = "Play steps";
    b.setAttribute("aria-pressed", "false");
  }
  function toggleAuto() {
    if (auto) {
      stopAuto();
      return;
    }
    if (index === steps.length - 1) {
      go(0);
    }
    const b = panel.querySelector("#cb-auto");
    b.textContent = "Pause";
    b.setAttribute("aria-pressed", "true");
    auto = setInterval(function () {
      if (index >= steps.length - 1) {
        stopAuto();
        return;
      }
      go(index + 1);
    }, 3600);
  }
  function onKey(event) {
    if (event.target.closest("select, input, textarea")) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stopAuto();
      go(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stopAuto();
      go(index - 1);
    } else if (event.key === " " && !event.target.closest("button")) {
      event.preventDefault();
      toggleAuto();
    }
  }
  document.addEventListener("keydown", onKey);
  panel.querySelector("#cb-back").addEventListener("click", function () {
    stopAuto();
    go(index - 1);
  });
  panel.querySelector("#cb-next").addEventListener("click", function () {
    stopAuto();
    go(index + 1);
  });
  panel.querySelector("#cb-auto").addEventListener("click", toggleAuto);
  for (const d of panel.querySelectorAll(".cb-dot")) {
    d.addEventListener("click", function () {
      stopAuto();
      go(Number(d.dataset.step));
    });
  }
  // place the highlight without a glide the first time
  hl.classList.add("no-glide");
  draw(true);
  void hl.offsetWidth;
  hl.classList.remove("no-glide");
  panel.querySelector("#cb-next").focus();
}

/* =====================================================================
   The textbook: a two-page spread. Turning the page flips a leaf over the spine; when it lands,
   the leaf is removed so the text on the pages is never left transformed (it stays crisp).
   ===================================================================== */
function pageSides(page, number, total) {
  let left = '<div class="tb-kicker">' + esc(page.kicker) + '</div><h2 class="tb-title">' + esc(page.title) + "</h2>";
  for (const paragraph of page.paragraphs) {
    left += "<p>" + esc(paragraph) + "</p>";
  }
  left += '<span class="tb-folio">' + (number * 2 - 1) + "</span>";
  const d = page.diagram;
  let right = '<figure class="tb-fig"><div class="tb-box"><span class="tb-box__label">' + esc(d.outer.label) + "</span>";
  for (const line of d.outer.lines) {
    right += '<code class="tb-line">' + esc(line) + "</code>";
  }
  right += '<div class="tb-box tb-box--inner"><span class="tb-box__label">' + esc(d.inner.label) + "</span>";
  for (const line of d.inner.lines) {
    right += '<code class="tb-line">' + esc(line) + "</code>";
  }
  right += "</div></div></figure>";
  right += '<div class="tb-term"><span class="tb-term__label">Key term</span><b>' + esc(page.key_term.term) + "</b> " + esc(page.key_term.definition) + "</div>";
  right += '<span class="tb-folio tb-folio--r">' + number * 2 + "</span>";
  return { left: left, right: right };
}

function openTextbook(look) {
  const pages = lesson.textbook.pages;
  let index = 0;
  let turning = false;
  let html = '<div class="tb" style="--subject:' + esc(look.color) + '">';
  html += '<div class="tb-book" id="tb-book"><div class="tb-page tb-page--l" id="tb-l"></div><div class="tb-page tb-page--r" id="tb-r"></div><span class="tb-spine" aria-hidden="true"></span></div>';
  html += '<div class="tb-nav"><button type="button" class="btn btn-light" id="tb-back">Previous page</button>';
  html += '<span class="note" id="tb-count" aria-live="polite"></span>';
  html += '<button type="button" class="btn" id="tb-next">Next page</button></div></div>';
  const view = openPanel(html, function () {
    document.removeEventListener("keydown", onKey);
    closed();
  }, "panel--book");
  const panel = view.panel;
  const book = panel.querySelector("#tb-book");
  const L = panel.querySelector("#tb-l");
  const R = panel.querySelector("#tb-r");

  function fill(i) {
    const s = pageSides(pages[i], i + 1, pages.length);
    L.innerHTML = s.left;
    R.innerHTML = s.right;
  }
  function status() {
    panel.querySelector("#tb-count").textContent = "Spread " + (index + 1) + " of " + pages.length;
    panel.querySelector("#tb-back").disabled = index === 0 || turning;
    panel.querySelector("#tb-next").disabled = index === pages.length - 1 || turning;
  }
  async function turn(dir) {
    const to = index + dir;
    if (turning || to < 0 || to >= pages.length) {
      return;
    }
    const now = pageSides(pages[index], index + 1, pages.length);
    const next = pageSides(pages[to], to + 1, pages.length);
    if (calm.matches || window.innerWidth < 760) {
      index = to;
      fill(index);
      status();
      return;
    }
    turning = true;
    status();
    // The leaf: forward, it carries this right page on its front and the next left page on its back,
    // over the next right page that is already in place underneath. Backward is the mirror.
    const leaf = document.createElement("div");
    leaf.className = "tb-leaf tb-leaf--" + (dir > 0 ? "fwd" : "back");
    leaf.innerHTML = '<div class="tb-page tb-face tb-face--front">' + (dir > 0 ? now.right : now.left) + "</div>" +
      '<div class="tb-page tb-face tb-face--back">' + (dir > 0 ? next.left : next.right) + "</div>";
    if (dir > 0) {
      R.innerHTML = next.right;
    } else {
      L.innerHTML = next.left;
    }
    book.appendChild(leaf);
    await animate(leaf, [
      { transform: "rotateY(0deg)" },
      { transform: dir > 0 ? "rotateY(-180deg)" : "rotateY(180deg)" }
    ], { duration: 640, easing: "cubic-bezier(.45,.05,.25,1)" });
    // A soft shadow sweeps across the page being uncovered while the leaf turns (see CSS).
    index = to;
    fill(index);
    leaf.remove();
    turning = false;
    status();
  }
  function onKey(event) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      turn(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      turn(-1);
    }
  }
  document.addEventListener("keydown", onKey);
  panel.querySelector("#tb-back").addEventListener("click", function () {
    turn(-1);
  });
  panel.querySelector("#tb-next").addEventListener("click", function () {
    turn(1);
  });
  fill(0);
  status();
  panel.querySelector("#tb-next").focus();
}

/* =====================================================================
   The listening desk: the lesson read aloud, one line at a time. Audio comes from the server
   (ElevenLabs, cached on disk); without it the browser's own voice reads the line. The current
   line is highlighted with a bar that fills as it is read, and the meter follows the voice.
   ===================================================================== */
function openListening(look) {
  const lines = lesson.listen.transcript;
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  const cache = new Map();
  let current = -1;
  let playing = false;
  let token = 0;
  let audio = null;
  let mode = "voice";
  let ctx = null;
  let analyser = null;
  let meterFrame = 0;
  let progressFrame = 0;

  let bars = "";
  for (let i = 0; i < 28; i = i + 1) {
    bars += "<i></i>";
  }
  let html = '<div class="ls" style="--subject:' + esc(look.color) + '">';
  html += '<div class="ls-deck"><button type="button" class="ls-play" id="ls-play" aria-label="Play the lesson"><span class="ls-play__icon" aria-hidden="true"></span></button>';
  html += '<div class="ls-info"><span class="kicker">Listen · ' + esc(lesson.skill_name) + '</span><h2>' + esc(lesson.title || lesson.skill_name) + "</h2>";
  html += '<p class="note" id="ls-status">' + lines.length + " parts. Press play, or choose a part to start there.</p></div>";
  html += '<div class="ls-meter" id="ls-meter" aria-hidden="true">' + bars + "</div>";
  html += '<div class="ls-speed"><label for="ls-rate">Speed</label><select id="ls-rate"><option value="0.85">0.85x</option><option value="1" selected>1x</option><option value="1.2">1.2x</option></select></div></div>';
  html += '<ol class="ls-lines" id="ls-lines">';
  for (let i = 0; i < lines.length; i = i + 1) {
    html += '<li><button type="button" data-line="' + i + '"><span class="ls-n">' + (i + 1) + '</span><span class="ls-t">' + esc(lines[i]) + '</span><span class="ls-bar" aria-hidden="true"></span></button></li>';
  }
  html += "</ol></div>";

  const view = openPanel(html, function () {
    stop();
    for (const url of cache.values()) {
      if (typeof url === "string") {
        URL.revokeObjectURL(url);
      }
    }
    if (ctx) {
      ctx.close().catch(function () {});
    }
    closed();
  }, "panel--listen");
  const panel = view.panel;
  const playBtn = panel.querySelector("#ls-play");
  const statusEl = panel.querySelector("#ls-status");
  const meter = panel.querySelectorAll("#ls-meter i");
  const items = panel.querySelectorAll("#ls-lines button");

  function rate() {
    return Number(panel.querySelector("#ls-rate").value);
  }
  function setPlaying(on) {
    playing = on;
    panel.querySelector(".ls").classList.toggle("is-playing", on);
    playBtn.setAttribute("aria-label", on ? "Pause" : "Play the lesson");
  }
  function highlight() {
    items.forEach(function (b, i) {
      b.classList.toggle("is-now", i === current);
      b.classList.toggle("is-done", i < current);
      if (i !== current) {
        b.querySelector(".ls-bar").style.transform = i < current ? "scaleX(1)" : "scaleX(0)";
      }
    });
    const now = items[current];
    if (now) {
      now.scrollIntoView({ block: "nearest", behavior: calm.matches ? "auto" : "smooth" });
    }
  }

  // Fetch a line's audio once; a 503 means "use the browser's voice".
  function load(i) {
    if (cache.has(i)) {
      return cache.get(i);
    }
    const p = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: lines[i] }) })
      .then(function (r) {
        if (!r.ok) {
          throw new Error("no audio");
        }
        return r.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        cache.set(i, url);
        return url;
      });
    cache.set(i, p);
    p.catch(function () {
      cache.delete(i);
    });
    return p;
  }

  function meterLoop() {
    if (!analyser) {
      return;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    for (let i = 0; i < meter.length; i = i + 1) {
      const v = data[2 + i * 2] / 255;
      meter[i].style.transform = "scaleY(" + Math.max(0.08, v).toFixed(3) + ")";
    }
    meterFrame = requestAnimationFrame(meterLoop);
  }
  function progressLoop() {
    const b = items[current];
    if (b && audio && audio.duration) {
      b.querySelector(".ls-bar").style.transform = "scaleX(" + Math.min(1, audio.currentTime / audio.duration).toFixed(4) + ")";
    }
    progressFrame = requestAnimationFrame(progressLoop);
  }

  function stop() {
    token = token + 1;
    setPlaying(false);
    if (audio) {
      audio.pause();
    }
    if (canSpeak) {
      window.speechSynthesis.cancel();
    }
    cancelAnimationFrame(meterFrame);
    cancelAnimationFrame(progressFrame);
    for (const m of meter) {
      m.style.transform = "";
    }
  }

  function finished(myToken, i) {
    if (myToken !== token) {
      return;
    }
    const b = items[i];
    if (b) {
      b.querySelector(".ls-bar").style.transform = "scaleX(1)";
    }
    if (i + 1 < lines.length) {
      playLine(i + 1);
    } else {
      stop();
      current = -1;
      highlight();
      statusEl.textContent = "Finished. Press play to hear it again.";
    }
  }

  function speakWithBrowser(i, myToken) {
    if (!canSpeak) {
      statusEl.textContent = "Audio is not available here, so read along with the lines below.";
      stop();
      return;
    }
    mode = "browser";
    panel.querySelector(".ls").classList.add("is-browser");
    statusEl.textContent = "Reading with your browser's voice (the lesson voice is not available right now).";
    const u = new SpeechSynthesisUtterance(lines[i]);
    u.rate = rate();
    u.onend = function () {
      finished(myToken, i);
    };
    window.speechSynthesis.speak(u);
  }

  async function playLine(i) {
    current = i;
    highlight();
    const myToken = token;
    if (mode === "browser") {
      speakWithBrowser(i, myToken);
      return;
    }
    statusEl.textContent = "Preparing part " + (i + 1) + "...";
    let url;
    try {
      url = await load(i);
    } catch (error) {
      if (myToken === token) {
        speakWithBrowser(i, myToken);
      }
      return;
    }
    if (myToken !== token) {
      return;
    }
    if (i + 1 < lines.length) {
      load(i + 1).catch(function () {});   // the next part is ready when this one ends
    }
    if (!audio) {
      audio = new Audio();
      audio.preservesPitch = true;
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const src = ctx.createMediaElementSource(audio);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.7;
        src.connect(analyser);
        analyser.connect(ctx.destination);
      } catch (error) {
        analyser = null;
      }
    }
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(function () {});
    }
    audio.src = url;
    audio.playbackRate = rate();
    audio.onended = function () {
      finished(myToken, i);
    };
    statusEl.textContent = "Part " + (i + 1) + " of " + lines.length + ".";
    try {
      await audio.play();
    } catch (error) {
      speakWithBrowser(i, myToken);
      return;
    }
    cancelAnimationFrame(meterFrame);
    cancelAnimationFrame(progressFrame);
    if (!calm.matches) {
      meterFrame = requestAnimationFrame(meterLoop);
    }
    progressFrame = requestAnimationFrame(progressLoop);
  }

  function start(i) {
    stop();
    setPlaying(true);
    playLine(i);
  }
  playBtn.addEventListener("click", function () {
    if (playing) {
      stop();
      statusEl.textContent = "Paused on part " + (current + 1) + ".";
      return;
    }
    start(current < 0 ? 0 : current);
  });
  items.forEach(function (b, i) {
    b.addEventListener("click", function () {
      start(i);
    });
  });
  panel.querySelector("#ls-rate").addEventListener("change", function () {
    if (audio) {
      audio.playbackRate = rate();
    }
  });
  load(0).catch(function () {});
  playBtn.focus();
}

/* ---------------- starting diagnostic ---------------- */
async function openDiagnostic(domain) {
  const pid = getProfileId();
  const data = await api("/api/profiles/" + pid + "/diagnostic/" + domain);
  let html = '<div class="panel-body"><div class="kicker">Start here</div><h2>Starting diagnostic</h2>';
  html += '<p class="lede">One question per skill. "Not sure" is fine: it starts that skill a little lower.</p><form id="dx">';
  let number = 0;
  for (const item of data.items) {
    number = number + 1;
    html += '<fieldset class="q"><legend>' + number + ". " + esc(item.question) + "</legend>";
    if (item.code) {
      html += "<pre>" + esc(item.code) + "</pre>";
    }
    for (let k = 0; k < item.options.length; k = k + 1) {
      html += '<label class="opt"><input type="radio" name="' + item.id + '" value="' + k + '">' + esc(item.options[k]) + "</label>";
    }
    html += '<label class="opt"><input type="radio" name="' + item.id + '" value="" checked>Not sure</label></fieldset>';
  }
  html += '<button type="submit" class="btn">Finish diagnostic</button></form></div>';
  const view = openPanel(html, function () {
    markStation("");
  });
  view.panel.querySelector("#dx").addEventListener("submit", async function (event) {
    event.preventDefault();
    const form = new FormData(event.target);
    const answers = {};
    for (const item of data.items) {
      const value = form.get(item.id);
      if (value !== null && value !== "") {
        answers[item.id] = Number(value);
      }
    }
    try {
      await api("/api/profiles/" + pid + "/diagnostic/" + domain, { answers: answers });
      view.close();
      toast("Diagnostic saved. Your starting point is set.");
      location.hash = "#/";
    } catch (error) {
      toast(error.message);
    }
  });
}
