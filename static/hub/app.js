// The school: hub (home), classic view and lunchroom. Classroom and gym live in their own files.
import { api, esc, fixed, main, getProfileId, setProfileId, renderTopBar, openPanel, toast, startPractice } from "./common.js";
import { buildLunchroom } from "./lunch3d.js";
import { mountRooms } from "./rooms3d.js";
import { showClassroom } from "./classroom.js";
import { showGym } from "./gym.js";

let renderCount = 0;

async function route() {
  renderCount = renderCount + 1;
  const myRender = renderCount;
  const path = location.hash.replace(/^#\/?/, "").split("?")[0];
  let summary;
  try {
    summary = await api("/api/profiles/" + getProfileId() + "/hub");
  } catch (error) {
    main.innerHTML = '<div class="empty-msg">Could not load: ' + esc(error.message) + "</div>";
    return;
  }
  if (myRender !== renderCount) {
    return;
  }
  document.getElementById("panel-root").innerHTML = "";
  stopLunchTimer();
  if (path === "classroom") {
    document.title = "Classroom · SkillBridge";
    await showClassroom(summary);
  } else if (path === "gym") {
    document.title = "Gym · SkillBridge";
    await showGym(summary);
  } else if (path === "lunch") {
    document.title = "Lunchroom · SkillBridge";
    showLunch(summary);
  } else if (path === "classic") {
    document.title = "Classic view · SkillBridge";
    showClassic(summary);
  } else {
    document.title = "SkillBridge School";
    showHub(summary);
  }
  main.focus({ preventScroll: true });
}

// ================= HUB =================
function roomHref(room, nextUp) {
  if (room === "classroom") {
    let href = "#/classroom?skill=" + nextUp.skill;
    if (nextUp.action === "take the starting diagnostic") {
      href += "&diagnostic=" + nextUp.domain;
    }
    return href;
  }
  if (room === "gym") {
    return "#/gym?skill=" + nextUp.skill;
  }
  return null;
}

function roomCard(id, label, name, href, badge, isNext) {
  let cls = "room";
  if (isNext) {
    cls += " next-step";
  }
  let pillClass = "pill";
  if (!badge.live) {
    pillClass += " quiet";
  }
  let html = '<a class="' + cls + '" data-room="' + id + '" href="' + href + '" aria-label="' + esc(name + ". " + label + ". " + badge.label) + '">';
  // The room itself is a small 3D scene, built by rooms3d.js once the page is in place.
  html += '<span class="stage3" data-scene="' + id + '" aria-hidden="true"></span>';
  html += '<span class="chip"><span class="kicker">' + esc(label) + "</span><strong>" + esc(name) + "</strong></span>";
  if (isNext) {
    html += '<span class="next-tag">NEXT STEP</span>';
  }
  html += '<span class="' + pillClass + '">' + esc(badge.label) + "</span>";
  html += "</a>";
  return html;
}

function masteryCard(summary) {
  let total = 0;
  let count = 0;
  for (const row of summary.mastery) {
    if (row.kind !== "module") {
      total = total + row.mastery;
      count = count + 1;
    }
  }
  let average = 0;
  if (count > 0) {
    average = total / count;
  }
  let html = '<section class="card" aria-labelledby="mastery-title"><div class="card-head"><h2 id="mastery-title">Skill mastery</h2>';
  html += '<span class="mono">avg ' + fixed(average, 2) + "</span></div>";
  for (const row of summary.mastery) {
    let trackClass = "track";
    if (row.kind === "module") {
      trackClass += " module";
    }
    html += '<div class="skill-row"><div class="top"><span>' + esc(row.name) + "</span><b>" + fixed(row.mastery, 2) + "</b></div>";
    html += '<div class="' + trackClass + '" role="img" aria-label="' + esc(row.name) + " mastery " + fixed(row.mastery, 2) + '"><i style="width:' + Math.round(row.mastery * 100) + '%"></i></div>';
    html += '<div class="state ' + row.kind + '">' + esc(row.state) + "</div></div>";
  }
  html += "</section>";
  return html;
}

function whyCard(nextUp) {
  let html = '<section class="card why" aria-labelledby="why-title"><h2 id="why-title">Why this pick</h2><table>';
  if (nextUp) {
    for (const pair of nextUp.decision.log) {
      html += "<tr><td>" + esc(pair[0]) + "</td><td>" + esc(pair[1]) + "</td></tr>";
    }
  } else {
    html += "<tr><td>action</td><td>nothing left to practise</td></tr>";
  }
  html += "</table></section>";
  return html;
}

function showHub(summary) {
  renderTopBar("hub", summary);
  const nextUp = summary.next_up;
  const rooms = summary.rooms;
  let nextRoom = "";
  if (nextUp) {
    nextRoom = nextUp.room;
  }

  let banner = "";
  if (nextUp) {
    banner = '<section class="banner" aria-labelledby="next-title"><div class="text">';
    banner += '<div class="kicker">Next up, chosen by the engine</div>';
    banner += '<h1 id="next-title">' + esc(nextUp.headline) + "</h1><p>" + esc(nextUp.reason) + "</p></div>";
    banner += '<div class="actions"><button type="button" class="btn btn-brass" id="go-next">' + esc(nextUp.button) + "</button>";
    banner += '<button type="button" class="btn btn-ghost" id="why-this">Why this?</button></div></section>';
  } else {
    banner = '<section class="banner"><div class="text"><div class="kicker">Next up</div><h1>Everything here is mastered</h1></div></section>';
  }

  let building = '<section class="school" aria-label="SkillBridge School"><div class="house"><div class="roof"><span class="roof-shape"></span><span class="flag"></span>';
  building += '<span class="roof-sign">SKILLBRIDGE SCHOOL</span></div><div class="building">';
  building += roomCard("classroom", "Learn", "The classroom", "#/classroom", rooms.classroom, nextRoom === "classroom");
  building += roomCard("library", "Review mistakes", "The library", "/library/", rooms.library, false);
  building += roomCard("gym", "Transfer check", "The gym", "#/gym", rooms.gym, nextRoom === "gym");
  building += roomCard("lunch", "Break", "The lunchroom", "#/lunch", rooms.lunch, false);
  building += '</div><div class="lawn"></div></div></section>';

  let small = '<section class="card small-stats" aria-label="Review and streak">';
  small += "<div>Mistakes due for review<strong>" + summary.mistakes_due + "</strong></div>";
  small += '<div style="text-align:right">Study streak<strong>' + summary.streak_days + " day";
  if (summary.streak_days !== 1) {
    small += "s";
  }
  small += "</strong></div></section>";

  main.innerHTML = '<div class="hub"><div class="hub-left">' + banner + building + '</div><aside class="hub-right">' +
    masteryCard(summary) + whyCard(nextUp) + small + "</aside></div>";
  mountRooms(main);

  if (nextUp) {
    const goButton = document.getElementById("go-next");
    goButton.addEventListener("click", async function () {
      if (nextUp.active_episode) {
        location.href = "/practice/#/lessons/" + nextUp.active_episode;
        return;
      }
      const href = roomHref(nextUp.room, nextUp);
      if (href) {
        location.hash = href;
        return;
      }
      goButton.disabled = true;
      try {
        await startPractice({ domain: nextUp.domain });
      } catch (error) {
        toast(error.message);
        goButton.disabled = false;
      }
    });
    document.getElementById("why-this").addEventListener("click", function () {
      showWhy(nextUp);
    });
  }
}

function showWhy(nextUp) {
  const d = nextUp.decision;
  let html = '<div class="panel-body"><h2>Why this pick?</h2>';
  html += '<p class="lede">The engine is plain arithmetic on your recorded attempts. No AI chooses this, and the same data always gives the same answer.</p>';
  html += '<table class="tbl"><tbody>';
  html += "<tr><th>Skill</th><td>" + esc(d.skill_name) + "</td></tr>";
  html += '<tr><th>Mastery</th><td class="num">' + fixed(d.mastery, 2) + "</td></tr>";
  html += '<tr><th>Error rate</th><td class="num">' + fixed(d.error_rate, 2) + " (" + d.misses + " of last " + d.tries + " tries)</td></tr>";
  html += '<tr><th>Priority</th><td class="num">(1 - ' + fixed(d.mastery, 2) + ") + 0.3 x " + fixed(d.error_rate, 2) + " + recency " + fixed(d.recency_bonus, 2) + " = " + fixed(d.priority, 2) + "</td></tr>";
  html += '<tr><th>Target difficulty</th><td class="num">' + fixed(d.target, 2) + "</td></tr>";
  html += "<tr><th>Chosen scenario</th><td>" + esc(nextUp.scenario.title) + " (difficulty " + fixed(nextUp.scenario.difficulty, 2) + ")</td></tr>";
  html += "</tbody></table>";
  html += '<h3 style="margin:18px 0 8px">What the engine considered</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Skill</th><th>Mastery</th><th>Error rate</th><th>Priority</th><th>Note</th></tr></thead><tbody>';
  for (const row of d.considered) {
    let note = "";
    if (row.blocked) {
      note = "skipped: prerequisite below 0.50";
    } else if (row.mastered) {
      note = "mastered";
    }
    html += "<tr><td>" + esc(row.name) + '</td><td class="num">' + fixed(row.mastery, 2) + '</td><td class="num">' + fixed(row.error_rate, 2) + '</td><td class="num">' + fixed(row.priority, 2) + "</td><td>" + note + "</td></tr>";
  }
  html += '</tbody></table></div><h3 style="margin:18px 0 8px">Logged reasons</h3><ol>';
  for (const reason of nextUp.reasons) {
    html += "<li>" + esc(reason) + "</li>";
  }
  html += "</ol></div>";
  openPanel(html);
}

// ================= CLASSIC VIEW =================
function showClassic(summary) {
  renderTopBar("classic", summary);
  let html = '<div class="classic"><section class="card"><h2>Skills</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Skill</th><th>Module</th><th>Mastery</th><th>Error rate</th><th>Scenarios</th><th>Status</th></tr></thead><tbody>';
  for (const row of summary.skills_table) {
    let status = "learning";
    if (row.mastered) {
      status = "mastered";
    } else if (row.blocked) {
      status = "locked";
    }
    html += "<tr><td>" + esc(row.name) + "</td><td>" + esc(row.domain) + '</td><td class="num">' + fixed(row.mastery, 2) + '</td><td class="num">' + fixed(row.error_rate, 2) + '</td><td class="num">' + row.episodes + "</td><td>" + status + "</td></tr>";
  }
  html += "</tbody></table></div></section>";

  html += '<section class="card"><h2>Next step and rooms</h2><table class="tbl"><tbody>';
  if (summary.next_up) {
    html += "<tr><th>Next up</th><td>" + esc(summary.next_up.headline) + "</td></tr>";
    html += "<tr><th>Reason</th><td>" + esc(summary.next_up.reason) + "</td></tr>";
  }
  const names = { classroom: "Classroom", library: "Library", gym: "Gym", lunch: "Lunchroom" };
  for (const key of ["classroom", "library", "gym", "lunch"]) {
    html += "<tr><th>" + names[key] + "</th><td>" + esc(summary.rooms[key].label) + "</td></tr>";
  }
  html += "</tbody></table></section>";

  html += '<section class="card"><h2>Recent attempts</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Scenario</th><th>Result</th><th>Attempts</th><th>Hints</th><th>Score o</th><th>Mode</th></tr></thead><tbody>';
  if (summary.recent.length === 0) {
    html += '<tr><td colspan="7">No attempts yet.</td></tr>';
  }
  for (const row of summary.recent) {
    let score = "-";
    if (row.score !== null) {
      score = fixed(row.score, 2);
    }
    html += "<tr><td>" + row.date + "</td><td>" + esc(row.title) + "</td><td>" + row.status + '</td><td class="num">' + row.attempts + '</td><td class="num">' + row.hints + '</td><td class="num">' + score + "</td><td>" + esc(row.mode || "") + "</td></tr>";
  }
  html += "</tbody></table></div></section>";

  html += '<section class="card"><h2>Engine selection log</h2><p class="lede">Every scenario choice is saved with its reason.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mode</th><th>Scenario</th><th>Priority</th><th>Target</th><th>Reason</th></tr></thead><tbody>';
  if (summary.selection_log.length === 0) {
    html += '<tr><td colspan="5">Nothing logged yet.</td></tr>';
  }
  for (const row of summary.selection_log) {
    let priority = "-";
    if (row.priority !== null) {
      priority = fixed(row.priority, 2);
    }
    let target = "-";
    if (row.target_difficulty !== null) {
      target = fixed(row.target_difficulty, 2);
    }
    let reason = "";
    if (row.reasons && row.reasons.length) {
      reason = row.reasons[0];
    }
    html += "<tr><td>" + esc(row.mode) + "</td><td>" + esc(row.scenario_id) + '</td><td class="num">' + priority + '</td><td class="num">' + target + "</td><td>" + esc(reason) + "</td></tr>";
  }
  html += '</tbody></table></div></section><p><a class="btn btn-light" href="/library/dashboard.html">Open the full dashboard</a></p></div>';
  main.innerHTML = html;
}

// ================= LUNCHROOM =================
const BREAK_SECONDS = 5 * 60;
let lunchTimer = null;
let lunchRoom = null;
let driftTimer = null;

function stopDrift() {
  clearInterval(driftTimer);
  driftTimer = null;
  if (lunchRoom) {
    lunchRoom.lean(0, 0, 0.02);
  }
}

function stopLunchTimer() {
  stopDrift();
  if (lunchTimer) {
    clearInterval(lunchTimer);
    lunchTimer = null;
  }
}

function clockText(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(rest).padStart(2, "0");
}

function showLunch(summary) {
  renderTopBar("lunch", summary, summary.rooms.lunch.label);
  const lunch = summary.rooms.lunch;
  const circumference = 2 * Math.PI * 74;
  let message = "<p>No hint pattern right now. A short break still helps you come back sharp.</p>";
  if (lunch.nudge) {
    message = "<p>You used hints on " + lunch.hinted + " of your last " + lunch.window + " scenarios.</p>";
    message += '<p class="note">After your break, the next scenario will be more guided so you can rebuild confidence.</p>';
  }
  let html = '<div class="scene scene3c lunch3c"><div class="stage3c" id="lunch-stage"></div>';
  html += '<section class="break-card break-card--3d" id="break-card" aria-labelledby="lunch-title"><div class="kicker">Take a break</div><h1 id="lunch-title">The lunchroom</h1>';
  html += '<div class="ring"><svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="74" fill="none" stroke="#E6DBC6" stroke-width="12"/>';
  html += '<circle id="ring-arc" cx="84" cy="84" r="74" fill="none" stroke="#3A2A1F" stroke-width="12" stroke-dasharray="' + circumference + '" stroke-dashoffset="0"/></svg>';
  html += '<div class="time"><b id="break-clock" role="timer" aria-live="off">' + clockText(BREAK_SECONDS) + "</b><span>suggested break</span></div></div>";
  // while the break runs: a slow breathing guide (4 s in, 4 s out)
  html += '<div class="breath" aria-hidden="true"><span class="breath__dot"></span><span class="breath__label"><i class="breath__in">Breathe in</i><i class="breath__out">Breathe out</i></span></div>';
  html += message;
  html += '<div class="actions"><button type="button" class="btn" id="break-start">Start break</button>';
  html += '<button type="button" class="btn btn-light" id="break-skip">Skip for now</button></div>';
  html += '<p class="note">Breaks never change your mastery scores.</p></section></div>';
  main.innerHTML = html;
  if (lunchRoom) {
    lunchRoom.destroy();
  }
  lunchRoom = buildLunchroom(document.getElementById("lunch-stage"));
  const card = document.getElementById("break-card");

  // During the break the room drifts very slowly from side to side.
  function startDrift() {
    let side = 1;
    lunchRoom.lean(1.6, 0.5, 0.01);
    driftTimer = setInterval(function () {
      side = -side;
      lunchRoom.lean(1.6 * side, 0.5 * side, 0.01);
    }, 7000);
  }

  let left = BREAK_SECONDS;
  let running = false;
  const startButton = document.getElementById("break-start");
  const clock = document.getElementById("break-clock");
  const arc = document.getElementById("ring-arc");
  const pid = getProfileId();

  function draw() {
    clock.textContent = clockText(left);
    const used = (BREAK_SECONDS - left) / BREAK_SECONDS;
    arc.setAttribute("stroke-dashoffset", String(circumference * used));
  }

  startButton.addEventListener("click", function () {
    if (running) {
      running = false;
      stopLunchTimer();
      card.classList.remove("is-running");
      startButton.textContent = "Resume break";
      return;
    }
    if (left === BREAK_SECONDS) {
      api("/api/profiles/" + pid + "/break", { event: "start" }).catch(function () {});
    }
    running = true;
    card.classList.add("is-running");
    startDrift();
    startButton.textContent = "Pause";
    lunchTimer = setInterval(function () {
      left = left - 1;
      draw();
      if (left <= 0) {
        stopLunchTimer();
        running = false;
        card.classList.remove("is-running");
        startButton.textContent = "Back to hub";
        startButton.onclick = function () {
          location.hash = "#/";
        };
        clock.setAttribute("aria-live", "assertive");
        api("/api/profiles/" + pid + "/break", { event: "finish" }).catch(function () {});
        toast("Break over. Ready for the next one?");
      }
    }, 1000);
  });
  document.getElementById("break-skip").addEventListener("click", function () {
    api("/api/profiles/" + pid + "/break", { event: "skip" }).catch(function () {});
    location.hash = "#/";
  });
}

// ================= START =================
async function boot() {
  let profiles = [];
  try {
    profiles = await api("/api/profiles");
  } catch (error) {
    main.innerHTML = '<div class="empty-msg">The SkillBridge server is not reachable.</div>';
    return;
  }
  if (profiles.length === 0) {
    main.innerHTML = '<div class="empty-msg">No learners yet. Run <code>python3 run.py demo</code> or create one on the practice screens.</div>';
    return;
  }
  let current = getProfileId();
  let found = false;
  for (const profile of profiles) {
    if (profile.id === current) {
      found = true;
    }
  }
  if (!found) {
    current = profiles[0].id;
    for (const profile of profiles) {
      if (profile.name === "Priya Nair") {
        current = profile.id;
      }
    }
  }
  setProfileId(current);
  window.addEventListener("hashchange", route);
  await route();
}

boot();
