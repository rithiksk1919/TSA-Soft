// The classroom: learn a skill the first time. Three stations (chalkboard, textbook, listening desk),
// the starting diagnostic, and "I am ready to practice".
import { api, esc, fixed, main, getProfileId, renderTopBar, openPanel, toast, query } from "./common.js";
import { classroomScene } from "./art.js";

let lesson = null;

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

export async function showClassroom(summary) {
  const pid = getProfileId();
  const skill = pickSkill(summary);
  lesson = await api("/api/profiles/" + pid + "/lesson/" + skill);
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

  let html = '<div class="scene">' + classroomScene();
  html += '<div class="chip"><span class="kicker">Learn it first</span><strong>The classroom</strong>';
  html += '<label class="note" for="lesson-pick" style="display:block;margin-top:6px">Lesson</label>';
  html += '<select id="lesson-pick" style="min-height:44px;border-radius:8px;border:1.5px solid #D8C9AC;background:#FBF8F1;font:inherit;padding:0 8px">' + options + "</select>";
  html += waitingNote + "</div>";
  html += '<button type="button" class="sign" data-station="watch" style="left:50%;top:7%;transform:translateX(-50%)"><span class="kicker">Watch</span><strong>The chalkboard</strong></button>';
  html += '<button type="button" class="sign" data-station="read" style="left:83%;top:48%;transform:translateX(-50%)"><span class="kicker">Read</span><strong>The textbook</strong></button>';
  html += '<button type="button" class="sign" data-station="listen" style="left:17%;top:56%;transform:translateX(-50%)"><span class="kicker">Listen</span><strong>The listening desk</strong></button>';
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

  document.getElementById("lesson-pick").addEventListener("change", function (event) {
    location.hash = "#/classroom?skill=" + event.target.value;
  });
  const stationButtons = main.querySelectorAll("[data-station]");
  for (const button of stationButtons) {
    button.addEventListener("click", function () {
      openStation(button.dataset.station, summary);
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
    openStation("diagnostic", summary);
  }
}

function needsDiagnostic(summary, domain) {
  if (!summary.next_up) {
    return false;
  }
  if (summary.next_up.domain !== domain) {
    return false;
  }
  return summary.next_up.action === "take the starting diagnostic";
}

function markStation(name) {
  const buttons = main.querySelectorAll(".bar .station");
  for (const button of buttons) {
    button.setAttribute("aria-pressed", String(button.dataset.station === name));
  }
}

function openStation(name, summary) {
  markStation(name);
  if (name !== "diagnostic") {
    api("/api/profiles/" + getProfileId() + "/lesson/" + lesson.skill + "/viewed", { station: name }).catch(function () {});
  }
  if (name === "watch") {
    openChalkboard();
  } else if (name === "read") {
    openTextbook();
  } else if (name === "listen") {
    openListening();
  } else {
    openDiagnostic(lesson.domain);
  }
}

function closed() {
  markStation("");
}

// ---------------- chalkboard: step through the code with the memory beside it ----------------
function openChalkboard() {
  const board = lesson.chalkboard;
  let index = 0;
  let html = '<div class="panel-body"><div class="kicker">Watch · ' + esc(lesson.skill_name) + "</div><h2>" + esc(board.title) + "</h2>";
  html += '<div class="chalk-grid"><div><div class="chalkboard"><ol id="code"></ol></div>';
  html += '<div id="narration" class="narration" aria-live="polite"></div>';
  html += '<div class="stepper"><button type="button" class="btn btn-light" id="step-back">Back</button>';
  html += '<button type="button" class="btn" id="step-next">Step forward</button><span id="step-count" class="note"></span></div></div>';
  html += '<div class="memory" aria-live="polite"><h3>Memory</h3><div id="memory"></div></div></div></div>';
  const view = openPanel(html, closed);

  function draw() {
    const step = board.steps[index];
    let code = "";
    for (let i = 0; i < board.code.length; i = i + 1) {
      let cls = "";
      let tag = "";
      if (i === step.line) {
        cls = "now";
        if (step.error) {
          cls = "error";
          tag = '<span class="err-tag">Error here</span>';
        }
      }
      code += '<li class="' + cls + '"><span class="n">' + (i + 1) + "</span><span>" + esc(board.code[i]) + tag + "</span></li>";
    }
    view.panel.querySelector("#code").innerHTML = code;

    const narration = view.panel.querySelector("#narration");
    if (step.error) {
      narration.className = "narration error";
      narration.innerHTML = "<strong>" + esc(step.error_label) + "</strong>" + esc(step.say);
    } else {
      narration.className = "narration";
      narration.textContent = step.say;
    }
    view.panel.querySelector("#memory").innerHTML = frameHtml("Global (the file)", step.memory.global, "") +
      frameHtml("Local: " + (board.local_label || "inside the function"), step.memory.local, " local");
    view.panel.querySelector("#step-count").textContent = "Step " + (index + 1) + " of " + board.steps.length;
    view.panel.querySelector("#step-back").disabled = index === 0;
    view.panel.querySelector("#step-next").disabled = index === board.steps.length - 1;
  }

  view.panel.querySelector("#step-back").addEventListener("click", function () {
    if (index > 0) {
      index = index - 1;
      draw();
    }
  });
  view.panel.querySelector("#step-next").addEventListener("click", function () {
    if (index < board.steps.length - 1) {
      index = index + 1;
      draw();
    }
  });
  draw();
}

function frameHtml(label, values, extraClass) {
  let html = '<div class="frame' + extraClass + '"><span class="kicker">' + esc(label) + "</span>";
  const names = Object.keys(values);
  if (names.length === 0) {
    html += '<span class="empty">No names here yet.</span>';
  } else {
    html += "<dl>";
    for (const name of names) {
      html += "<dt>" + esc(name) + "</dt><dd>= " + esc(values[name]) + "</dd>";
    }
    html += "</dl>";
  }
  return html + "</div>";
}

// ---------------- textbook: a two-page spread ----------------
function openTextbook() {
  const pages = lesson.textbook.pages;
  let index = 0;
  const view = openPanel('<div id="spread"></div>', closed);

  function draw() {
    const page = pages[index];
    let left = '<div class="left"><div class="kicker">' + esc(page.kicker) + "</div><h2>" + esc(page.title) + "</h2>";
    for (const paragraph of page.paragraphs) {
      left += "<p>" + esc(paragraph) + "</p>";
    }
    left += "</div>";
    let right = '<div class="right"><div class="nest"><div class="kicker">' + esc(page.diagram.outer.label) + "</div>";
    for (const line of page.diagram.outer.lines) {
      right += "<div>" + esc(line) + "</div>";
    }
    right += '<div class="inner"><div class="kicker">' + esc(page.diagram.inner.label) + "</div>";
    for (const line of page.diagram.inner.lines) {
      right += "<div>" + esc(line) + "</div>";
    }
    right += "</div></div>";
    right += '<div class="term"><div class="kicker">Key term</div>' + esc(page.key_term.term) + ": " + esc(page.key_term.definition) + "</div>";
    right += '<div class="pager"><button type="button" class="btn btn-light" id="page-back">Previous page</button>';
    right += '<span class="note">Page ' + (index + 1) + " of " + pages.length + "</span>";
    right += '<button type="button" class="btn" id="page-next">Next page</button></div></div>';
    const spread = view.panel.querySelector("#spread");
    spread.className = "spread";
    spread.innerHTML = left + right;
    const back = view.panel.querySelector("#page-back");
    const next = view.panel.querySelector("#page-next");
    back.disabled = index === 0;
    next.disabled = index === pages.length - 1;
    back.addEventListener("click", function () {
      index = index - 1;
      draw();
      view.panel.querySelector("#page-back").focus();
    });
    next.addEventListener("click", function () {
      index = index + 1;
      draw();
      view.panel.querySelector("#page-next").focus();
    });
  }
  draw();
}

// ---------------- listening desk: the browser reads the transcript aloud ----------------
function openListening() {
  const lines = lesson.listen.transcript;
  const canSpeak = "speechSynthesis" in window && typeof SpeechSynthesisUtterance === "function";
  let current = -1;
  let playing = false;
  let token = 0;

  let bars = "";
  for (let i = 0; i < 48; i = i + 1) {
    const height = 20 + ((i * 37) % 70);
    bars += '<i style="height:' + height + "%;animation-delay:" + ((i % 7) * 0.12) + 's"></i>';
  }
  let html = '<div class="panel-body"><div class="kicker">Listen · ' + esc(lesson.skill_name) + "</div><h2>The listening desk</h2>";
  html += '<div class="player"><button type="button" class="play" id="play" aria-label="Play">Play</button>';
  html += '<div class="wave" id="wave" aria-hidden="true">' + bars + "</div>";
  html += '<div class="speed"><label for="speed">Speed</label><select id="speed"><option value="0.8">0.8x</option><option value="1" selected>1x</option><option value="1.25">1.25x</option></select></div></div>';
  if (!canSpeak) {
    html += '<p class="note">Audio is not available in this browser, so read along with the transcript below.</p>';
  }
  html += '<ol class="transcript" id="transcript">';
  for (let i = 0; i < lines.length; i = i + 1) {
    html += '<li data-line="' + i + '">' + esc(lines[i]) + "</li>";
  }
  html += "</ol></div>";

  const view = openPanel(html, function () {
    stop();
    closed();
  });
  const playButton = view.panel.querySelector("#play");
  const wave = view.panel.querySelector("#wave");
  if (!canSpeak) {
    playButton.disabled = true;
  }

  function highlight() {
    const items = view.panel.querySelectorAll("#transcript li");
    for (const item of items) {
      item.classList.toggle("now", Number(item.dataset.line) === current);
    }
  }
  function stop() {
    token = token + 1;
    playing = false;
    if (canSpeak) {
      window.speechSynthesis.cancel();
    }
    playButton.textContent = "Play";
    playButton.setAttribute("aria-label", "Play");
    wave.classList.remove("playing");
  }
  function speak(index) {
    if (index >= lines.length) {
      stop();
      current = -1;
      highlight();
      return;
    }
    current = index;
    highlight();
    const myToken = token;
    const utterance = new SpeechSynthesisUtterance(lines[index]);
    utterance.rate = Number(view.panel.querySelector("#speed").value);
    utterance.onend = function () {
      if (myToken === token && playing) {
        speak(index + 1);
      }
    };
    window.speechSynthesis.speak(utterance);
  }
  playButton.addEventListener("click", function () {
    if (playing) {
      stop();
      return;
    }
    playing = true;
    playButton.textContent = "Pause";
    playButton.setAttribute("aria-label", "Pause");
    wave.classList.add("playing");
    let start = current;
    if (start < 0) {
      start = 0;
    }
    speak(start);
  });
}

// ---------------- starting diagnostic ----------------
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
  const view = openPanel(html, closed);
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
