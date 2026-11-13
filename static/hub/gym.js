// The gym: four stations on one court (gym3d.js). The gym always opens on the station picker.
//   Bug Hoops   the transfer check: unlocks for a skill once its mastery reaches 0.80
//   Dodgeball, Loop Laps, Ohm Toss   warm-up games, open at any mastery (gymgames.js)
// Every shot and every answer is graded on the server against a hidden answer key.
import { api, esc, fixed, main, getProfileId, renderTopBar, toast, query } from "./common.js";
import { buildGym } from "./gym3d.js";
import { playDrill, leaveDrill } from "./gymgames.js";

let game = null;
let gymRoom = null;
let currentSkillName = "";

const ctx = {
  room: function () {
    return gymRoom;
  },
  setUI: setUI
};

export async function showGym(summary) {
  leaveDrill();
  const q = query();
  const ready = summary.rooms.gym.ready;
  if (q.game && q.game !== "hoops") {
    renderTopBar("gym", summary, "Warm-ups: open at any mastery");
    await playDrill(ctx, q.game, q.skill);
    return;
  }
  // Bug Hoops (also reached as #/gym?skill=... from the hub's next step)
  if (q.game === "hoops" || q.skill) {
    let skill = null;
    for (const item of ready) {
      if (item.skill === q.skill) {
        skill = item;
      }
    }
    if (!skill && ready.length > 0) {
      skill = ready[0];
    }
    if (skill) {
      renderTopBar("gym", summary, "Transfer check: " + skill.name.toLowerCase());
      currentSkillName = skill.name;
      showIntro(skill, ready);
      return;
    }
  }
  renderTopBar("gym", summary, ready.length ? "Transfer check ready" : "Warm-ups: open at any mastery");
  await showMenu(summary);
}

// The 3D gym is built once per visit; each screen only replaces the panels over it. Game screens
// (playing, the default) shift the scene right of their panel; the station picker centres it.
function setUI(html, playing) {
  let ui = document.getElementById("gym-ui");
  if (!ui || !document.getElementById("gym-stage")) {
    main.innerHTML = '<div class="scene scene3c gym3c" id="gym-scene"><div class="stage3c" id="gym-stage"></div><div id="gym-ui"></div></div>';
    if (gymRoom) {
      gymRoom.destroy();
    }
    const stage = document.getElementById("gym-stage");
    gymRoom = buildGym(stage);
    ui = document.getElementById("gym-ui");
    // Clicking a station in the room opens it, the same as its card.
    stage.addEventListener("click", function (event) {
      const hit = event.target.closest("[data-station]");
      if (hit && gymRoom.at() === "overview") {
        const card = document.querySelector('.gym-card[data-game="' + hit.dataset.station + '"]');
        if (card && card.tagName === "A") {
          location.hash = card.getAttribute("href");
        }
      }
    });
    // for the QA probes: play a shot without a game in progress, or reach the room
    window.__gymShoot = function (made) {
      gymRoom.resetBall();
      return gymRoom.shoot(made);
    };
    window.__gymRoom = gymRoom;
  }
  document.getElementById("gym-scene").classList.toggle("is-playing", playing !== false);
  ui.innerHTML = html;
}

/* ---------------- the station picker ---------------- */

async function showMenu(summary) {
  let overview = { games: [] };
  let stale = false;
  try {
    overview = await api("/api/profiles/" + getProfileId() + "/gym/games");
  } catch (error) {
    // a server started before the warm-up games existed answers 404 here
    stale = true;
  }
  const ready = summary.rooms.gym.ready;
  let cards = "";
  if (ready.length) {
    const names = ready.map(function (r) { return r.name; }).join(", ");
    cards += '<a class="gym-card is-ready" data-game="hoops" href="#/gym?game=hoops&amp;skill=' + esc(ready[0].skill) + '">';
    cards += '<span class="kicker">Transfer check · ready</span><strong>Bug Hoops</strong><span class="gym-card__for">' + esc(names) + "</span>";
    cards += '<span class="gym-card__best">3 shots, no hints</span></a>';
  } else {
    let closest = null;
    for (const row of summary.skills_table) {
      if (!row.mastered && (!closest || row.mastery > closest.mastery)) {
        closest = row;
      }
    }
    // Not ready for the transfer check yet: the hoop is open for practice shots.
    cards += '<a class="gym-card" data-game="hoops" href="#/gym?game=shootaround">';
    cards += '<span class="kicker">Practice shots</span><strong>Bug Hoops</strong><span class="gym-card__for">Shootaround now; the transfer check opens at mastery 0.80.</span>';
    if (closest) {
      cards += '<span class="gym-card__best">Closest: ' + esc(closest.name) + " " + fixed(closest.mastery, 2) + "</span>";
    }
    cards += "</a>";
  }
  for (const g of overview.games) {
    if (g.id === "shootaround") {
      continue;   // reached through the Bug Hoops card
    }
    let best = "New";
    if (g.best !== null && g.best !== undefined) {
      best = "Best " + g.best + "/" + g.rounds;
    }
    cards += '<a class="gym-card" data-game="' + esc(g.id) + '" href="#/gym?game=' + esc(g.id) + '">';
    cards += '<span class="kicker">' + esc(g.tagline) + "</span><strong>" + esc(g.name) + "</strong>";
    cards += '<span class="gym-card__for">For you: ' + esc(g.focus.slice(0, 2).join(", ")) + "</span>";
    cards += '<span class="gym-card__best">' + esc(best) + " · " + g.rounds + " rounds</span></a>";
  }
  let html = '<div class="chip"><span class="kicker">The gym</span><strong>Pick a station</strong></div>';
  html += '<section class="gym-hello" aria-labelledby="gym-hello-title"><span class="kicker">Warm up, then prove it</span>';
  html += '<h2 id="gym-hello-title">Four stations, one court</h2>';
  html += "<p>The warm-ups drill one rule at a time and aim at your weakest skills. Every answer shows the rule behind it.</p>";
  html += "<p>Bug Hoops is the transfer check: a problem you have never seen, with no hints.</p>";
  if (stale) {
    html += '<p role="alert" style="color:var(--bad);font-weight:600">The warm-up games could not load. Restart the server (python run.py) and reload this page.</p>';
  }
  html += "</section>";
  html += '<nav class="gym-menu" aria-label="Gym stations">' + cards + "</nav>";
  setUI(html, false);
  gymRoom.resetBall();
  gymRoom.loadBall();
  gymRoom.resetRunner();
  gymRoom.setRings(["?", "?", "?", "?"]);
  gymRoom.score({ round: "-", score: 0, streak: 0 });
  if (gymRoom.at() !== "overview") {
    gymRoom.fly("overview", 1000);
  }
  // Pointing at a card lights its station in the room.
  for (const card of main.querySelectorAll(".gym-card")) {
    const on = function () { gymRoom.highlight(card.dataset.game); };
    const off = function () { gymRoom.highlight(null); };
    card.addEventListener("pointerenter", on);
    card.addEventListener("focus", on);
    card.addEventListener("pointerleave", off);
    card.addEventListener("blur", off);
  }
}

/* ---------------- Bug Hoops ---------------- */

function sceneStart() {
  return '<div class="chip"><span class="kicker">Transfer check game</span><strong>Bug Hoops</strong></div>' +
    '<a class="btn btn-light gym-exit" href="#/gym">All stations</a>';
}

function showScore(roundNumber) {
  if (!gymRoom || !game) {
    return;
  }
  gymRoom.score({ round: Math.min(roundNumber, game.rounds.length) + "/" + game.rounds.length, score: game.made, streak: streak(game.rounds) });
}

function showIntro(skill, ready) {
  let picker = "";
  if (ready.length > 1) {
    picker = '<p><label for="gym-skill">Skill </label><select id="gym-skill" class="drill-select">';
    for (const item of ready) {
      let selected = "";
      if (item.skill === skill.skill) {
        selected = " selected";
      }
      picker += '<option value="' + item.skill + '"' + selected + ">" + esc(item.name) + "</option>";
    }
    picker += "</select></p>";
  }
  let html = sceneStart();
  html += '<section class="board" aria-labelledby="intro-title"><div class="row"><span class="kicker">Transfer check · ' + esc(skill.name) + '</span><span class="kicker">3 rounds</span></div>';
  html += '<h2 id="intro-title">Three shots, no hints</h2>';
  html += "<p>Each round is a problem you have never seen, with new names and a new story. Click the line that has the bug to take your shot. Make 2 of 3 to pass.</p>";
  html += picker + '<div class="actions" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-brass" id="start-game">Start game</button></div></section>';
  setUI(html);
  gymRoom.highlight(null);
  gymRoom.resetBall();
  gymRoom.score({ round: "-", score: 0, streak: 0 });
  if (gymRoom.at() !== "hoops") {
    gymRoom.fly("hoops", 1100);
  }
  const picked = document.getElementById("gym-skill");
  if (picked) {
    picked.addEventListener("change", function () {
      location.hash = "#/gym?game=hoops&skill=" + picked.value;
    });
  }
  const startButton = document.getElementById("start-game");
  startButton.focus({ preventScroll: true });
  startButton.addEventListener("click", async function () {
    startButton.disabled = true;
    try {
      game = await api("/api/profiles/" + getProfileId() + "/gym/start", { skill: skill.skill });
      showRound();
    } catch (error) {
      toast(error.message);
      startButton.disabled = false;
    }
  });
}

function streak(rounds) {
  let count = 0;
  for (const round of rounds) {
    if (!round.shot) {
      break;
    }
    if (round.shot.made) {
      count = count + 1;
    } else {
      count = 0;
    }
  }
  return count;
}

function hudHtml(roundNumber) {
  if (roundNumber > game.rounds.length) {
    roundNumber = game.rounds.length;
  }
  let html = '<div class="hud" aria-live="polite">';
  html += "<span>ROUND " + roundNumber + " OF " + game.rounds.length + "</span>";
  html += "<span>SCORE " + game.made + "</span>";
  html += "<span>STREAK " + streak(game.rounds) + "</span>";
  html += '<span class="locked">Hints locked</span></div>';
  return html;
}

function showRound() {
  const round = game.rounds[game.shots_taken];
  let lines = "";
  for (let i = 0; i < round.lines.length; i = i + 1) {
    lines += '<li><button type="button" data-line="' + i + '" aria-label="Line ' + (i + 1) + ": " + esc(round.lines[i]) + '">';
    lines += '<span class="n">' + (i + 1) + "</span><span>" + esc(round.lines[i]) + '</span><span class="mark"></span></button></li>';
  }
  let html = sceneStart() + hudHtml(game.shots_taken + 1);
  html += '<section class="board" aria-labelledby="round-title"><div class="row"><span class="kicker">' + esc(currentSkillName) + '</span><span class="kicker">' + esc(round.kicker) + "</span></div>";
  html += '<h2 id="round-title">' + esc(round.title) + "</h2><p>" + esc(round.story) + "</p>";
  html += '<ol class="lines">' + lines + "</ol>";
  html += '<p id="shot-help" style="margin-top:12px">Click the line that has the bug to take your shot.</p><div id="shot-result" aria-live="polite"></div></section>';
  html += '<aside class="info"><span class="kicker">How it counts</span>Every shot is graded by the evaluator against a fixed answer key. Hints stay locked so a pass proves you can do it alone.</aside>';
  setUI(html);
  gymRoom.resetBall();
  showScore(game.shots_taken + 1);

  const buttons = main.querySelectorAll(".lines button");
  for (const button of buttons) {
    button.addEventListener("click", function () {
      shoot(Number(button.dataset.line), buttons);
    });
  }
  buttons[0].focus({ preventScroll: true });
}

async function shoot(line, buttons) {
  for (const button of buttons) {
    button.disabled = true;
  }
  let shot;
  try {
    shot = await api("/api/gym/" + game.id + "/shot", { line: line });
  } catch (error) {
    toast(error.message);
    for (const button of buttons) {
      button.disabled = false;
    }
    return;
  }
  await gymRoom.shoot(shot.made);

  const chosen = buttons[shot.chosen_line];
  const answer = buttons[shot.correct_line];
  if (shot.made) {
    chosen.classList.add("made");
    chosen.querySelector(".mark").textContent = "Bug found";
  } else {
    chosen.classList.add("missed");
    chosen.querySelector(".mark").textContent = "Not this one";
    answer.classList.add("answer");
    answer.querySelector(".mark").textContent = "The bug";
  }

  game = await api("/api/gym/" + game.id);
  let heading = "Swish! That is the bug.";
  if (!shot.made) {
    heading = "Off the rim. The bug was on line " + (shot.correct_line + 1) + ".";
  }
  let nextLabel = "Next round";
  if (shot.finished) {
    nextLabel = "See the result";
  }
  const box = document.getElementById("shot-result");
  box.innerHTML = '<div class="result"><strong>' + esc(heading) + "</strong>" + esc(shot.explanation) + '</div><p><button type="button" class="btn btn-brass" id="next-round">' + nextLabel + "</button></p>";
  document.getElementById("shot-help").hidden = true;
  const hud = main.querySelector(".hud");
  hud.outerHTML = hudHtml(shot.round);
  showScore(shot.round);
  const nextButton = document.getElementById("next-round");
  nextButton.focus({ preventScroll: true });
  nextButton.addEventListener("click", function () {
    if (shot.finished) {
      showFinal(shot.result);
    } else {
      showRound();
    }
  });
}

function showFinal(result) {
  let message;
  if (result.passed) {
    message = "<p><strong>Passed.</strong> 2 of 3 with no hints counts as the transfer check for " + esc(currentSkillName) + ".</p>";
    if (result.newly_mastered && result.newly_mastered.length > 0) {
      message += "<p>" + esc(currentSkillName) + " is now mastered.</p>";
    } else {
      message += "<p>Mastery is confirmed once your last two near-level solves include this check, so keep practising if it is not marked mastered yet.</p>";
    }
    if (!game.counts_as_transfer) {
      message += '<p class="note">You had already seen these problems, so this game was practice and does not count as a fresh transfer check.</p>';
    }
  } else {
    message = "<p><strong>Not this time.</strong> " + esc(currentSkillName) + " goes back to practice, and a worked example comes first.</p>";
  }
  let changes = "";
  let stillReady = true;
  const keys = Object.keys(result.mastery_changes || {});
  for (const key of keys) {
    const pair = result.mastery_changes[key];
    changes += "<li>Mastery " + fixed(pair[0], 2) + " to " + fixed(pair[1], 2) + "</li>";
    if (pair[1] < 0.8) {
      stillReady = false;
    }
  }
  if (result.newly_mastered && result.newly_mastered.length > 0) {
    stillReady = false;
  }
  let againButton = '<button type="button" class="btn btn-brass" id="play-again">Play again</button>';
  if (!stillReady && !result.passed) {
    againButton = '<a class="btn btn-brass" href="#/classroom?skill=' + game.skill + '">Worked example in the classroom</a>';
  } else if (!stillReady) {
    againButton = "";
  }
  let html = sceneStart() + hudHtml(game.rounds.length);
  html += '<section class="final" aria-labelledby="final-title"><div class="kicker">Bug Hoops · ' + esc(currentSkillName) + "</div>";
  html += '<h2 id="final-title">' + result.made + " of 3 shots made</h2>" + message;
  if (changes) {
    html += '<ul style="text-align:left">' + changes + "</ul>";
  }
  html += '<div class="actions">' + againButton + '<a class="btn btn-light" href="#/gym">All stations</a></div></section>';
  setUI(html);
  showScore(game.rounds.length);
  const title = document.getElementById("final-title");
  title.setAttribute("tabindex", "-1");
  title.focus({ preventScroll: true });
  const again = document.getElementById("play-again");
  if (again) {
    again.addEventListener("click", function () {
      window.dispatchEvent(new Event("hashchange"));
    });
  }
}
