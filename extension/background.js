// Keeps each tab's action log (all its frames together) and streams it to the side panel. Logs live in memory and are saved
// to session storage (cleared when the browser closes) so they survive the worker going to sleep.
const MAX = 3000;
const logs = new Map();        // tabId -> events
const live = new Set();        // tabIds where the logger is running
const ports = new Set();       // open side panels: { port, tabId }
const gates = new Map();       // tabId -> { education, reasons, url, title }

/* ---- saving to the SkillBridge app, so the log can be read later (scripts/mistakes.py) ---- */
// Recorded (school-related) actions are posted to the local SkillBridge server, which appends
// them to data/action-log/YYYY-MM-DD.jsonl. If the app isn't running they wait and are retried.
const SERVERS = ["http://127.0.0.1:8000", "http://localhost:8000"];
let server = null;             // the SkillBridge origin last seen in a tab
let pending = [];
let sync = { ok: null, saved: 0, error: "" };
let flushing = false;

function slim(ev) {
  let text = JSON.stringify(ev);
  if (text.length <= 30000) {
    return ev;
  }
  const copy = JSON.parse(text);
  if (copy.detail && copy.detail.response !== undefined) {
    copy.detail.response = String(JSON.stringify(copy.detail.response)).slice(0, 4000) + "… (clipped)";
  }
  text = JSON.stringify(copy);
  return text.length <= 30000 ? copy : { t: ev.t, type: ev.type, summary: ev.summary, url: ev.url, detail: "(too large to save)" };
}

function flush() {
  if (flushing || !pending.length) {
    return;
  }
  flushing = true;
  const batch = [];
  let size = 0;
  while (pending.length && batch.length < 200) {
    const n = JSON.stringify(pending[0]).length;
    if (batch.length && size + n > 150000) {
      break;
    }
    batch.push(pending.shift());
    size += n;
  }
  const targets = (server ? [server] : []).concat(SERVERS.filter(function (s) {
    return s !== server;
  }));
  (function tryNext(i) {
    if (i >= targets.length) {
      pending = batch.concat(pending).slice(-5000);
      sync = { ok: false, saved: sync.saved, error: "The SkillBridge app isn't running, so actions are waiting to be saved." };
      flushing = false;
      announceSync();
      return;
    }
    fetch(targets[i] + "/api/action-log", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch }) })
      .then(function (res) {
        if (!res.ok) {
          throw new Error("HTTP " + res.status);
        }
        return res.json();
      })
      .then(function (data) {
        server = targets[i];
        sync = { ok: true, saved: sync.saved + (data.saved || 0), error: "" };
        flushing = false;
        announceSync();
        save();
        if (pending.length) {
          flush();
        }
      }, function () {
        tryNext(i + 1);
      });
  })(0);
}
setInterval(flush, 4000);

function announceSync() {
  for (const p of ports) {
    p.port.postMessage({ kind: "sync", sync: sync, pending: pending.length, server: server });
  }
}
let loaded = null;
let saveTimer = 0;

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(function () {});

function load() {
  if (!loaded) {
    loaded = chrome.storage.session.get(["logs", "live", "pending", "gates", "sync", "server"]).then(function (data) {
      pending = (data.pending || []).concat(pending);
      if (data.sync) {
        sync = data.sync;
      }
      server = server || data.server || null;
      for (const [id, g] of Object.entries(data.gates || {})) {
        if (!gates.has(Number(id))) {
          gates.set(Number(id), g);
        }
      }
      for (const [id, events] of Object.entries(data.logs || {})) {
        if (!logs.has(Number(id))) {
          logs.set(Number(id), events);
        }
      }
      for (const id of data.live || []) {
        live.add(id);
      }
    }).catch(function () {});
  }
  return loaded;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    chrome.storage.session.set({ logs: Object.fromEntries(logs), live: Array.from(live), pending: pending, gates: Object.fromEntries(gates), sync: sync, server: server }).catch(function () {
      // over the session quota: keep the newest half of every log and try once more
      for (const [id, events] of logs) {
        logs.set(id, events.slice(-Math.floor(MAX / 2)));
      }
      chrome.storage.session.set({ logs: Object.fromEntries(logs), live: Array.from(live) }).catch(function () {});
    });
  }, 800);
}

function broadcast(tabId, message) {
  for (const p of ports) {
    if (p.tabId === tabId) {
      p.port.postMessage(message);
    }
  }
}

chrome.runtime.onMessage.addListener(function (msg, sender) {
  const tabId = sender.tab && sender.tab.id;
  if (tabId === undefined) {
    return;
  }
  load().then(function () {
    if (msg.kind === "gate") {
      gates.set(tabId, { education: msg.education, reasons: msg.reasons, url: msg.url, title: msg.title });
      if (msg.education && /skillbridge/i.test(msg.title || "") && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(msg.url)) {
        server = new URL(msg.url).origin;
      }
      broadcast(tabId, { kind: "gate", gate: gates.get(tabId) });
      save();
    } else if (msg.kind === "hello") {
      live.add(tabId);
      broadcast(tabId, { kind: "status", live: true });
      save();
    } else if (msg.kind === "event") {
      const list = logs.get(tabId) || [];
      list.push(msg.event);
      if (list.length > MAX) {
        list.splice(0, list.length - MAX);
      }
      logs.set(tabId, list);
      broadcast(tabId, { kind: "event", event: msg.event });
      const g = gates.get(tabId);
      pending.push(slim(Object.assign({ tab: tabId, page: g ? g.title : "" }, msg.event)));
      if (pending.length > 5000) {
        pending.splice(0, pending.length - 5000);
      }
      if (pending.length >= 50) {
        flush();
      }
      save();
    }
  });
});

chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== "panel") {
    return;
  }
  const entry = { port: port, tabId: null };
  ports.add(entry);
  port.onDisconnect.addListener(function () {
    ports.delete(entry);
  });
  port.onMessage.addListener(function (msg) {
    load().then(function () {
      if (msg.kind === "watch") {
        entry.tabId = msg.tabId;
        port.postMessage({ kind: "history", tabId: msg.tabId, live: live.has(msg.tabId), events: logs.get(msg.tabId) || [], gate: gates.get(msg.tabId) || null });
        port.postMessage({ kind: "sync", sync: sync, pending: pending.length, server: server });
      } else if (msg.kind === "clear") {
        logs.set(msg.tabId, []);
        save();
      } else if (msg.kind === "restore") {
        logs.set(msg.tabId, (msg.events || []).concat(logs.get(msg.tabId) || []).slice(-MAX));
        save();
        port.postMessage({ kind: "history", tabId: msg.tabId, live: live.has(msg.tabId), events: logs.get(msg.tabId) });
      }
    });
  });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  load().then(function () {
    logs.delete(tabId);
    live.delete(tabId);
    gates.delete(tabId);
    save();
  });
});
