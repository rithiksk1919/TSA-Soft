// The Listener (skillbridge/listener.py): the server drives Chrome over its DevTools Protocol, attaches to
// every tab and frame, and answers true or false: can it see every action taken in Chrome?
// This module is the pill in the top bar and its panel. It polls /api/listener while the page is visible.
import { api, esc, openPanel, toast } from "./common.js";

let status = null;
let openDetails = null;
let pollTimer = 0;
let busy = false;

async function refresh() {
  try {
    status = await api("/api/listener");
  } catch (error) {
    return;
  }
  paintPill();
  if (openDetails && !busy) {
    openDetails.panel.querySelector(".panel-body").innerHTML = detailsHtml();
    wireDetails(openDetails.panel);
  }
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(function () {
    if (!document.hidden) {
      refresh();
    }
  }, 2000);
}

function pillParts() {
  if (!status || !status.enabled) {
    return { cls: "off", value: "Off" };
  }
  return status.sees_all ? { cls: "true", value: "true" } : { cls: "false", value: "false" };
}

export function listenerPillHtml() {
  const parts = pillParts();
  return '<button type="button" class="listener-pill" id="listener-pill" data-state="' + parts.cls + '" aria-haspopup="dialog">' +
    'Listener: <b class="mono">' + esc(parts.value) + "</b></button>";
}

export function wireListenerPill() {
  const pill = document.getElementById("listener-pill");
  if (!pill) {
    return;
  }
  pill.addEventListener("click", showDetails);
  if (!pollTimer) {
    refresh();
    startPolling();
  }
}

function paintPill() {
  const pill = document.getElementById("listener-pill");
  if (!pill) {
    return;
  }
  const parts = pillParts();
  pill.dataset.state = parts.cls;
  pill.querySelector("b").textContent = parts.value;
}

function detailsHtml() {
  const on = Boolean(status && status.enabled);
  let html = "<h2>Listener</h2>";
  html += '<div class="listener-row"><span>Can it see every action taken in Chrome?</span>' +
    '<button type="button" class="btn ' + (on ? "btn-light" : "") + '" id="listener-toggle" data-on="' + on + '">' +
    (busy ? "Opening Chrome…" : on ? "Turn off" : "Turn on") + "</button></div>";

  if (!on) {
    html += '<p class="listener-verdict" data-v="off"><b class="mono">false</b> ' + esc(status ? status.reasons.join(" ") : "The Listener is off.") + "</p>";
    html += '<p class="muted">Turning it on opens a Chrome window the Listener is connected to, with its own profile. ' +
      "Chrome doesn't let anything connect to your regular profile, so use that window, and close any other Chrome windows.</p>";
    return html;
  }
  const covered = status.tabs.covered + " of " + status.tabs.total + " tabs reporting. " + status.actions.total + " actions counted.";
  html += '<p class="listener-verdict" data-v="' + status.sees_all + '"><b class="mono">' + status.sees_all + "</b> " + esc(covered) + "</p>";
  if (status.reasons.length) {
    html += '<ul class="listener-reasons">';
    for (const reason of status.reasons) {
      html += "<li>" + esc(reason) + "</li>";
    }
    html += "</ul>";
  }
  const kinds = Object.entries(status.actions.by_kind).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 6);
  html += '<dl class="listener-counts">';
  for (const pair of kinds) {
    html += "<dt>" + esc(pair[0]) + "</dt><dd>" + pair[1] + "</dd>";
  }
  html += "<dt>Tabs opened / closed</dt><dd>" + status.browser.tabs_opened + " / " + status.browser.tabs_closed + "</dd>";
  html += "<dt>Page loads</dt><dd>" + status.browser.navigations + "</dd></dl>";
  html += '<p class="muted">It counts kinds of action only. It never records which key, any text or page content, and nothing leaves this computer. ' +
    "Chrome's own address bar and menus aren't visible to it, only what they do (a page loads, a tab opens).</p>";
  return html;
}

function wireDetails(panel) {
  const button = panel.querySelector("#listener-toggle");
  if (!button) {
    return;
  }
  button.disabled = busy;
  button.addEventListener("click", async function () {
    const turnOn = button.dataset.on !== "true";
    busy = true;
    button.disabled = true;
    if (turnOn) {
      button.textContent = "Opening Chrome…";
    }
    try {
      status = await api("/api/listener", { enabled: turnOn, open: location.href });
    } catch (error) {
      toast(error.message);
    }
    busy = false;
    paintPill();
    if (openDetails) {
      openDetails.panel.querySelector(".panel-body").innerHTML = detailsHtml();
      wireDetails(openDetails.panel);
    }
  });
}

function showDetails() {
  openDetails = openPanel('<div class="panel-body">' + detailsHtml() + "</div>", function () {
    openDetails = null;
  }, "listener-panel");
  wireDetails(openDetails.panel);
  refresh();
}
