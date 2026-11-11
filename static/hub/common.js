// Shared helpers for the school screens: API calls, the chosen learner, the top bar and panels.

export const main = document.getElementById("main");
const PROFILE_KEY = "skillbridge.profile";

export async function api(path, body) {
  const options = { method: "GET", headers: {} };
  if (body !== undefined) {
    options.method = "POST";
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = {};
  }
  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ")");
  }
  return data;
}

export function esc(value) {
  let text = "";
  if (value !== undefined && value !== null) {
    text = String(value);
  }
  const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  let out = "";
  for (const ch of text) {
    if (map[ch]) {
      out += map[ch];
    } else {
      out += ch;
    }
  }
  return out;
}

export function fixed(number, places) {
  return Number(number).toFixed(places);
}

// ---- the learner (a local profile id, no login) ----
export function getProfileId() {
  let value = null;
  try {
    value = Number(localStorage.getItem(PROFILE_KEY));
  } catch (error) {
    value = null;
  }
  if (!value) {
    return null;
  }
  return value;
}

export function setProfileId(id) {
  try {
    localStorage.setItem(PROFILE_KEY, String(id));
  } catch (error) {
    // storage can be blocked; the cookie below still works
  }
  // The library reads its data for this learner from the cookie.
  document.cookie = "sb_profile=" + id + "; path=/; SameSite=Lax; max-age=31536000";
}

export function firstName(name) {
  return String(name).split(" ")[0];
}

// ---- top bar ----
// view: "hub" | "classroom" | "gym" | "lunch" | "classic"
export function renderTopBar(view, summary, rightText) {
  const bar = document.getElementById("topbar");
  const name = summary.profile.name;
  let crumb = "Hub";
  if (view === "classroom") {
    crumb = "Classroom";
  } else if (view === "gym") {
    crumb = "Gym";
  } else if (view === "lunch") {
    crumb = "Lunchroom";
  } else if (view === "classic") {
    crumb = "Classic view";
  }

  let html = "";
  if (view !== "hub" && view !== "classic") {
    html += '<a class="btn btn-light" href="#/">Back to hub</a>';
  }
  html += '<a class="logo" href="#/">SkillBridge</a>';
  html += '<span class="crumb">' + esc(name) + " / " + crumb + "</span>";
  html += '<span class="grow"></span>';
  if (view === "hub" || view === "classic") {
    html += '<div class="toggle" role="group" aria-label="Home view">';
    html += '<button type="button" id="view-school" aria-pressed="' + (view === "hub") + '">School</button>';
    html += '<button type="button" id="view-classic" aria-pressed="' + (view === "classic") + '">Classic view</button>';
    html += "</div>";
    html += switchButtonHtml(summary);
  } else if (rightText) {
    html += '<span class="bar-note">' + esc(rightText) + "</span>";
  }
  bar.innerHTML = html;

  if (view === "hub" || view === "classic") {
    document.getElementById("view-school").addEventListener("click", function () {
      location.hash = "#/";
    });
    document.getElementById("view-classic").addEventListener("click", function () {
      location.hash = "#/classic";
    });
    const switchButton = document.getElementById("switch-learner");
    if (switchButton) {
      switchButton.addEventListener("click", function () {
        setProfileId(Number(switchButton.dataset.to));
        window.dispatchEvent(new Event("hashchange"));
      });
    }
  }
}

function switchButtonHtml(summary) {
  const target = summary.demo.switch_to;
  if (!target) {
    return "";
  }
  let current = "Learner: " + firstName(summary.profile.name);
  if (summary.profile.is_demo) {
    current = "Demo learner: " + firstName(summary.profile.name);
  }
  return '<button type="button" class="btn btn-light" id="switch-learner" data-to="' + target.id + '">' +
    esc(current) + ". Switch to " + esc(target.first) + "</button>";
}

// ---- a large panel over a dimmed scene, with focus kept inside and Esc to close ----
export function openPanel(html, onClose, extraClass) {
  const root = document.getElementById("panel-root");
  const opener = document.activeElement;
  let cls = "panel";
  if (extraClass) {
    cls += " " + extraClass;
  }
  root.innerHTML = '<div class="scrim"><div class="' + cls + '" role="dialog" aria-modal="true" tabindex="-1">' +
    '<button type="button" class="btn btn-light panel-close" data-close>Close</button>' + html + "</div></div>";
  const panel = root.querySelector(".panel");

  function close() {
    root.innerHTML = "";
    document.removeEventListener("keydown", onKey);
    if (onClose) {
      onClose();
    }
    if (opener && opener.focus) {
      opener.focus();
    }
  }
  function onKey(event) {
    if (event.key === "Escape") {
      close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = panel.querySelectorAll("a[href], button:not([disabled]), input, select");
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", onKey);
  const closers = panel.querySelectorAll("[data-close]");
  for (const button of closers) {
    button.addEventListener("click", close);
  }
  root.querySelector(".scrim").addEventListener("mousedown", function (event) {
    if (event.target.classList.contains("scrim")) {
      close();
    }
  });
  panel.focus();
  return { panel: panel, close: close };
}

export function toast(message) {
  const box = document.getElementById("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(function () {
    box.hidden = true;
  }, 5000);
}

export function query() {
  const out = {};
  const hash = location.hash;
  const mark = hash.indexOf("?");
  if (mark < 0) {
    return out;
  }
  const params = new URLSearchParams(hash.slice(mark + 1));
  for (const pair of params) {
    out[pair[0]] = pair[1];
  }
  return out;
}

export async function startPractice(body) {
  const episode = await api("/api/profiles/" + getProfileId() + "/episodes", body);
  location.href = "/practice/#/lessons/" + episode.id;
}
