// The gym's warm-up games: Dodgeball (bug or clean?), Loop Laps (trace the loop) and Ohm Toss
// (land the right value). Each round is graded on the server against the answer key; the 3D room
// then plays it out (gym3d.js), and the rule behind the answer is shown every time, right or wrong.
// Warm-ups never change mastery. Keys: B / C in Dodgeball, 1-4 (or A-D) in Laps and Toss.
import { api, esc, getProfileId, toast } from "./common.js";

const POSE = { dodgeball: "dodge", laps: "laps", toss: "toss", shootaround: "hoops" };
let drill = null;
let keyHandler = null;
let seq = 0;          // bumps whenever the screen changes, so a late animation never writes to a stale one

// Stops the current game's keys and any animation still running toward a screen that is gone.
export function leaveDrill() {
  seq = seq + 1;
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
  }
  keyHandler = null;
}

function keys(map) {
  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler);
  }
  keyHandler = function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
      return;
    }
    if (!document.getElementById("gym-ui")) {
      leaveDrill();
      return;
    }
    const tag = event.target && event.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") {
      return;
    }
    const fn = map[event.key.toLowerCase()];
    if (fn) {
      event.preventDefault();
      fn();
    }
  };
  document.addEventListener("keydown", keyHandler);
}

function chip(name) {
  return '<div class="chip"><span class="kicker">Gym warm-up</span><strong>' + esc(name) + "</strong></div>" +
    '<a class="btn btn-light gym-exit" href="#/gym">All stations</a>';
}

function streakOf(items) {
  let count = 0;
  for (const item of items) {
    if (!item.result) {
      break;
    }
    count = item.result.correct ? count + 1 : 0;
  }
  return count;
}

function hud(index) {
  const n = drill.items.length;
  const round = Math.min(index + 1, n);
  return '<div class="hud" aria-live="polite"><span>ROUND ' + round + " OF " + n + "</span><span>SCORE " + drill.score +
    "</span><span>STREAK " + streakOf(drill.items) + "</span></div>";
}

function scoreboard(ctx, index) {
  ctx.room().score({ round: Math.min(index + 1, drill.items.length) + "/" + drill.items.length, score: drill.score, streak: streakOf(drill.items) });
}

function snippet(lines) {
  let out = "";
  for (let i = 0; i < lines.length; i = i + 1) {
    out += '<span class="ln" aria-hidden="true">' + (i + 1) + "</span>" + esc(lines[i]) + "\n";
  }
  return '<pre class="snip">' + out + "</pre>";
}

/* ---------------- the intro ---------------- */

export async function playDrill(ctx, gameId, skill) {
  leaveDrill();
  const token = seq;
  let overview;
  try {
    overview = await api("/api/profiles/" + getProfileId() + "/gym/games");
  } catch (error) {
    toast(error.message);
    return;
  }
  if (token !== seq) {
    return;
  }
  const info = overview.games.find(function (g) { return g.id === gameId; });
  if (!info) {
    location.hash = "#/gym";
    return;
  }
  const room = ctx.room() || null;
  let options = '<option value="">My weakest skills (recommended)</option>';
  for (const s of info.skills) {
    const selected = s.skill === skill ? " selected" : "";
    options += '<option value="' + esc(s.skill) + '"' + selected + ">" + esc(s.name) + " · mastery " + s.mastery.toFixed(2) + "</option>";
  }
  let best = "Not played yet.";
  if (info.best !== null && info.best !== undefined) {
    best = "Best so far: " + info.best + " of " + info.rounds + ".";
  }
  let html = chip(info.name);
  html += '<section class="board" aria-labelledby="drill-title"><div class="row"><span class="kicker">' + esc(info.tagline) + '</span><span class="kicker">' + info.rounds + " rounds</span></div>";
  html += '<h2 id="drill-title">' + esc(info.name) + "</h2><p>" + esc(info.blurb) + "</p>";
  html += "<p>Every answer comes with the rule behind it. Rounds are aimed at the skills you are weakest in: <strong>" + esc(info.focus.join(", ")) + "</strong>.</p>";
  html += '<p><label for="drill-skill">Practise </label><select id="drill-skill" class="drill-select">' + options + "</select></p>";
  html += '<p class="note" style="font-size:14px;color:#D9C9AE">Warm-ups never change mastery. ' + esc(best) + "</p>";
  html += '<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-brass" id="drill-start">Start ' + esc(info.name) + "</button></div></section>";
  ctx.setUI(html);
  const gym = ctx.room();
  gym.highlight(null);
  prepare(gym, gameId);
  gym.score({ round: "-", score: 0, streak: 0 });
  if (!room || gym.at() !== POSE[gameId]) {
    gym.fly(POSE[gameId], 1100);
  }
  const start = document.getElementById("drill-start");
  const select = document.getElementById("drill-skill");
  select.addEventListener("change", function () {
    location.hash = "#/gym?game=" + gameId + (select.value ? "&skill=" + select.value : "");
  });
  start.addEventListener("click", async function () {
    start.disabled = true;
    try {
      drill = await api("/api/profiles/" + getProfileId() + "/gym/games/" + gameId + "/start", { skill: select.value || null });
    } catch (error) {
      toast(error.message);
      start.disabled = false;
      return;
    }
    if (token !== seq) {
      return;
    }
    drill.skill = select.value || null;
    showRound(ctx, token);
  });
  start.focus({ preventScroll: true });
}

function prepare(gym, gameId) {
  if (gameId === "dodgeball") {
    gym.loadBall();
  } else if (gameId === "laps") {
    gym.resetRunner();
  } else if (gameId === "shootaround") {
    gym.resetBall();
  } else {
    gym.setRings(["?", "?", "?", "?"]);
  }
}

/* ---------------- a round ---------------- */

function showRound(ctx, token) {
  const index = drill.answered;
  const item = drill.items[index];
  const gym = ctx.room();
  let body = "";
  if (drill.game === "dodgeball") {
    body += '<h2 id="round-title">Bug or clean?</h2>';
    body += '<p class="goal"><b>Should: </b>' + esc(item.goal) + "</p>" + snippet(item.lines);
    body += '<ul class="choices choices--two" aria-label="Your call">';
    body += '<li><button type="button" class="choice" data-choice="bug"><kbd>B</kbd><span><span class="val">Dodge</span><span class="what">It has a bug</span></span></button></li>';
    body += '<li><button type="button" class="choice" data-choice="clean"><kbd>C</kbd><span><span class="val">Catch</span><span class="what">It is clean</span></span></button></li></ul>';
  } else if (drill.game === "shootaround") {
    body += '<h2 id="round-title">' + esc(item.title) + "</h2><p>" + esc(item.story) + '</p><ol class="lines">';
    for (let i = 0; i < item.lines.length; i = i + 1) {
      body += '<li><button type="button" data-choice="' + i + '" aria-label="Line ' + (i + 1) + ": " + esc(item.lines[i]) + '">';
      body += '<span class="n">' + (i + 1) + "</span><span>" + esc(item.lines[i]) + '</span><span class="mark"></span></button></li>';
    }
    body += '</ol><p style="margin-top:10px;font-size:14px;color:#D9C9AE">Click the line with the bug (or press its number) to take your shot.</p>';
  } else {
    const tags = drill.game === "toss" ? "ABCD" : "1234";
    if (drill.game === "laps") {
      body += '<h2 id="round-title">' + esc(item.ask) + "</h2>" + snippet(item.lines);
      body += '<p style="font-size:14px;color:#D9C9AE">Predict first. Then the runner runs one lap for every pass of the loop.</p>';
    } else {
      body += '<h2 id="round-title">' + esc(item.ask) + "</h2>";
      body += '<p style="font-size:14px;color:#D9C9AE">Toss the beanbag onto the ring with the right value.</p>';
    }
    body += '<ul class="choices" aria-label="Answers">';
    for (let i = 0; i < item.choices.length; i = i + 1) {
      const label = drill.game === "toss" ? item.choices[i] + " " + item.unit : item.choices[i];
      body += '<li><button type="button" class="choice" data-choice="' + i + '"><kbd>' + tags[i] + '</kbd><span class="val">' + esc(label) + "</span></button></li>";
    }
    body += "</ul>";
  }
  let html = chip(drill.name) + hud(index);
  html += '<section class="board" aria-labelledby="round-title"><div class="row"><span class="kicker">' + esc(item.skill_name) + '</span><span class="kicker">' + esc(drill.tagline) + "</span></div>";
  html += body + '<div id="drill-trace"></div><div id="drill-result" aria-live="polite"></div></section>';
  ctx.setUI(html);
  scoreboard(ctx, index);
  if (drill.game === "dodgeball") {
    gym.loadBall();
  } else if (drill.game === "laps") {
    gym.resetRunner();
  } else if (drill.game === "shootaround") {
    gym.resetBall();
  } else {
    gym.setRings(item.choices.map(function (c) { return c + " " + item.unit; }));
  }

  const buttons = Array.from(main().querySelectorAll("[data-choice]"));
  let busy = false;
  async function pick(choice) {
    if (busy) {
      return;
    }
    busy = true;
    for (const b of buttons) {
      b.disabled = true;
    }
    let res;
    try {
      res = await api("/api/drills/" + drill.id + "/answer", { index: index, choice: choice });
    } catch (error) {
      toast(error.message);
      busy = false;
      for (const b of buttons) {
        b.disabled = false;
      }
      return;
    }
    if (token !== seq) {
      return;
    }
    item.result = res;
    drill.answered = index + 1;
    if (res.correct) {
      drill.score = drill.score + 1;
    }
    await playOut(ctx, item, res, buttons, token);
    if (token !== seq) {
      return;
    }
    showFeedback(ctx, item, res, buttons, token);
  }
  for (const b of buttons) {
    b.addEventListener("click", function () {
      const value = b.dataset.choice;
      pick(drill.game === "dodgeball" ? value : Number(value));
    });
  }
  const map = {};
  if (drill.game === "dodgeball") {
    map.b = function () { pick("bug"); };
    map.c = function () { pick("clean"); };
  } else if (drill.game === "shootaround") {
    for (let i = 0; i < Math.min(9, item.lines.length); i = i + 1) {
      map[String(i + 1)] = pick.bind(null, i);
    }
  } else {
    for (let i = 0; i < 4; i = i + 1) {
      map[String(i + 1)] = pick.bind(null, i);
      if (drill.game === "toss") {
        map["abcd"[i]] = pick.bind(null, i);
      }
    }
  }
  keys(map);
  buttons[0].focus({ preventScroll: true });
}

function main() {
  return document.getElementById("gym-ui");
}

// The 3D part of a round: the ball flies, the runner runs, the beanbag lands.
async function playOut(ctx, item, res, buttons, token) {
  const gym = ctx.room();
  const chosen = buttons.find(function (b) { return b.dataset.choice === String(res.choice); });
  if (chosen) {
    chosen.classList.add("is-chosen");
  }
  if (drill.game === "dodgeball") {
    let how = "dodge";
    if (res.choice === "clean") {
      how = res.correct ? "catch" : "hit";
    }
    await gym.fire(how);
  } else if (drill.game === "laps") {
    const box = document.getElementById("drill-trace");
    let head = "<tr><th scope=\"col\">Lap</th>";
    for (const name of item.watch) {
      head += '<th scope="col">' + esc(name) + "</th>";
    }
    box.innerHTML = '<table class="trace"><caption class="sr-only">Each lap of the loop</caption><thead>' + head + "</tr></thead><tbody></tbody></table>";
    const rows = box.querySelector("tbody");
    await gym.runLaps(res.trace.length, function (i) {
      if (token !== seq) {
        return;
      }
      const row = res.trace[i];
      let tr = "<td>" + (i + 1) + "</td>";
      const parts = [];
      for (const name of item.watch) {
        const value = row[name] === undefined ? "-" : row[name];
        tr += "<td>" + esc(value) + "</td>";
        parts.push(name + " = " + value);
      }
      for (const old of rows.querySelectorAll(".is-new")) {
        old.classList.remove("is-new");
      }
      rows.insertAdjacentHTML("beforeend", '<tr class="is-new">' + tr + "</tr>");
      gym.lapBoard(i + 1, parts.join("   "));
    });
  } else if (drill.game === "shootaround") {
    await gym.shoot(res.correct);
  } else {
    await gym.toss(res.choice, res.correct, res.answer);
  }
}

function showFeedback(ctx, item, res, buttons, token) {
  if (drill.game === "shootaround") {
    const chosen = buttons[res.choice];
    if (res.correct) {
      chosen.classList.add("made");
      chosen.querySelector(".mark").textContent = "Bug found";
    } else {
      chosen.classList.add("missed");
      chosen.querySelector(".mark").textContent = "Not this one";
      buttons[res.answer].classList.add("answer");
      buttons[res.answer].querySelector(".mark").textContent = "The bug";
    }
  }
  for (const b of buttons) {
    if (drill.game === "shootaround") {
      break;
    }
    const value = drill.game === "dodgeball" ? b.dataset.choice : Number(b.dataset.choice);
    if (value === res.choice) {
      b.classList.add(res.correct ? "is-right" : "is-wrong");
    } else if (value === res.answer && !res.correct) {
      b.classList.add("is-key");
    }
  }
  let heading;
  if (drill.game === "dodgeball") {
    if (res.correct) {
      heading = res.answer === "bug" ? "Dodged it. That one has a bug." : "Caught it. That one is clean.";
    } else {
      heading = res.answer === "bug" ? "Ouch: you caught a bug." : "You dodged a clean one. It works as it should.";
    }
  } else if (drill.game === "shootaround") {
    heading = res.correct ? "Swish! That is the bug." : "Off the rim. The bug was on line " + (res.answer + 1) + ".";
  } else if (drill.game === "laps") {
    const right = item.choices[res.answer];
    heading = res.correct ? "Right: " + right + ", in " + plural(res.trace.length, "lap") + "." : "Not quite. It is " + right + ", after " + plural(res.trace.length, "lap") + ".";
  } else {
    const right = item.choices[res.answer] + " " + item.unit;
    heading = res.correct ? "On the ring: " + right + "." : "Off the ring. The answer is " + right + ".";
  }
  const last = res.finished;
  const box = document.getElementById("drill-result");
  box.innerHTML = '<div class="result ' + (res.correct ? "result--good" : "result--bad") + '"><strong>' + esc(heading) + "</strong><p>" + esc(res.why) + "</p></div>" +
    '<p style="margin-top:12px"><button type="button" class="btn btn-brass" id="drill-next">' + (last ? "See how you did" : "Next round") + "</button></p>";
  const ui = main();
  const hudEl = ui.querySelector(".hud");
  if (hudEl) {
    hudEl.outerHTML = hud(drill.answered - 1);
  }
  scoreboard(ctx, drill.answered - 1);
  const next = document.getElementById("drill-next");
  function go() {
    if (token !== seq) {
      return;
    }
    if (last) {
      showFinal(ctx, res.summary, token);
    } else {
      showRound(ctx, token);
    }
  }
  next.addEventListener("click", go);
  keys({});
  next.focus({ preventScroll: true });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

/* ---------------- the end ---------------- */

function showFinal(ctx, summary, token) {
  keys({});
  let lead;
  const ratio = summary.score / summary.of;
  if (ratio === 1) {
    lead = "A clean sweep.";
  } else if (ratio >= 0.6) {
    lead = "Good work. Read the rules you missed once more.";
  } else {
    lead = "Worth another go once you have read the rules below.";
  }
  let best = "Best so far: " + Math.max(summary.previous_best, summary.score) + " of " + summary.of + ".";
  if (summary.new_best && summary.previous_best > 0) {
    best = "New best (was " + summary.previous_best + ").";
  } else if (summary.new_best) {
    best = "Your first score here.";
  }
  let tally = "";
  for (const s of summary.skills) {
    tally += "<li>" + esc(s.name) + ": " + s.right + " of " + s.of + "</li>";
  }
  let rules = "";
  for (const r of summary.rules) {
    rules += '<li class="' + (r.correct ? "got" : "missed") + '"><b>' + (r.correct ? "Got it" : "Missed") + " · " + esc(r.skill_name) + "</b>" + esc(r.why) + "</li>";
  }
  let html = chip(drill.name);
  html += '<section class="final final--wide" aria-labelledby="final-title"><div class="kicker">' + esc(drill.name) + " · warm-up</div>";
  html += '<h2 id="final-title">' + summary.score + " of " + summary.of + "</h2><p class=\"lead\">" + esc(lead) + '</p><p class="best">' + esc(best) + "</p>";
  html += '<ul class="tally" aria-label="By skill">' + tally + "</ul>";
  html += '<h3 style="font-size:16px;margin:14px 0 0">The rules from this game</h3><ul class="rules">' + rules + "</ul>";
  html += '<div class="actions"><button type="button" class="btn btn-brass" id="drill-again">Play again</button>';
  if (summary.lesson) {
    html += '<a class="btn btn-light" href="#/classroom?skill=' + esc(summary.lesson.skill) + '">Worked example: ' + esc(summary.lesson.name) + "</a>";
  }
  html += '<a class="btn btn-light" href="#/gym">All stations</a></div>';
  html += '<p class="note" style="text-align:center;font-size:13px;color:var(--muted);margin-top:12px">Warm-ups never change mastery. The transfer check in Bug Hoops does.</p></section>';
  ctx.setUI(html);
  const title = document.getElementById("final-title");
  title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
  document.getElementById("drill-again").addEventListener("click", async function (event) {
    event.currentTarget.disabled = true;
    try {
      const skill = drill.skill;
      drill = await api("/api/profiles/" + getProfileId() + "/gym/games/" + drill.game + "/start", { skill: skill });
      drill.skill = skill;
    } catch (error) {
      toast(error.message);
      return;
    }
    if (token !== seq) {
      return;
    }
    showRound(ctx, token);
  });
}
