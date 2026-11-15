// The side panel: shows the action log of the tab it sits beside, live, newest first.
// Open it from the toolbar button; it follows whichever tab is active in its window.
(function () {
  const TYPES = [
    { id: "click", label: "Clicks", short: "Click", c: "--click" },
    { id: "key", label: "Keys", short: "Key", c: "--key" },
    { id: "input", label: "Input", short: "Input", c: "--input" },
    { id: "nav", label: "Pages", short: "Page", c: "--nav" },
    { id: "net", label: "Network", short: "API", c: "--net" },
    { id: "ui", label: "Messages", short: "Msg", c: "--ui" },
    { id: "speech", label: "Speech", short: "Speech", c: "--speech" },
    { id: "storage", label: "Storage", short: "Store", c: "--storage" },
    { id: "hover", label: "Hover", short: "Hover", c: "--hover" },
    { id: "focus", label: "Focus", short: "Focus", c: "--focus-t" },
    { id: "error", label: "Errors", short: "Error", c: "--error" }
  ];
  const BY_ID = Object.fromEntries(TYPES.map(function (t) {
    return [t.id, t];
  }));
  const SHOW_MAX = 1000;
  // Chrome lets extensions record ordinary web pages and local files, not its own pages.
  const TARGET = /^(https?|file):/;

  const $ = function (id) {
    return document.getElementById(id);
  };
  const logEl = $("log");
  const emptyEl = $("empty");
  const statusEl = $("status");
  const pageEl = $("page");
  const searchEl = $("search");
  const pauseBtn = $("pause");

  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false });
  const countFmt = new Intl.NumberFormat();
  const whenFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

  const state = {
    tabId: null,
    tabUrl: "",
    live: false,
    events: [],
    shown: new Set(TYPES.map(function (t) {
      return t.id;
    })),
    query: "",
    frames: true,
    paused: false,
    held: 0,
    open: new WeakSet(),
    undo: null,
    gate: null
  };
  const gateEl = $("gate");
  const syncEl = $("sync");

  /* ---- filters ---- */
  const chips = {};
  for (const t of TYPES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.style.setProperty("--c", "var(" + t.c + ")");
    b.setAttribute("aria-pressed", "true");
    b.innerHTML = '<i aria-hidden="true"></i><span></span> <b></b>';
    b.querySelector("span").textContent = t.label;
    b.addEventListener("click", function () {
      if (state.shown.has(t.id)) {
        state.shown.delete(t.id);
      } else {
        state.shown.add(t.id);
      }
      saveFilters();
      render();
    });
    $("filters").appendChild(b);
    chips[t.id] = b;
  }
  function saveFilters() {
    chrome.storage.local.set({ shown: Array.from(state.shown) }).catch(function () {});
  }
  chrome.storage.local.get("shown").then(function (data) {
    if (Array.isArray(data.shown)) {
      state.shown = new Set(data.shown);
      render();
    }
  }).catch(function () {});

  let searchTimer = 0;
  searchEl.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
      state.query = searchEl.value.trim().toLowerCase();
      render();
    }, 120);
  });

  const framesBtn = $("frames");
  framesBtn.addEventListener("click", function () {
    state.frames = !state.frames;
    framesBtn.setAttribute("aria-pressed", String(state.frames));
    chrome.storage.local.set({ frames: state.frames }).catch(function () {});
    render();
  });
  chrome.storage.local.get("frames").then(function (data) {
    if (data.frames === false) {
      state.frames = false;
      framesBtn.setAttribute("aria-pressed", "false");
      render();
    }
  }).catch(function () {});

  pauseBtn.addEventListener("click", function () {
    state.paused = !state.paused;
    pauseBtn.setAttribute("aria-pressed", String(state.paused));
    pauseBtn.textContent = state.paused ? "Resume" : "Pause";
    if (!state.paused) {
      state.held = 0;
      render();
    }
    updateStatus();
  });

  $("export").addEventListener("click", function () {
    const blob = new Blob([JSON.stringify({ tab: state.tabUrl, exported: new Date().toISOString(), actions: state.events }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "skillbridge-actions-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".json";
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 2000);
  });

  // Clearing can be undone for a few seconds.
  $("clear").addEventListener("click", function () {
    if (state.tabId === null || !state.events.length) {
      return;
    }
    const kept = state.events;
    state.events = [];
    send({ kind: "clear", tabId: state.tabId });
    render();
    clearTimeout(state.undo);
    $("undo-text").textContent = "Cleared " + countFmt.format(kept.length) + " actions.";
    $("undo").hidden = false;
    $("undo-btn").onclick = function () {
      $("undo").hidden = true;
      send({ kind: "restore", tabId: state.tabId, events: kept });
    };
    state.undo = setTimeout(function () {
      $("undo").hidden = true;
    }, 6000);
  });

  /* ---- talking to the background worker ---- */
  let port = null;
  function connect() {
    port = chrome.runtime.connect({ name: "panel" });
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(function () {
      port = null;
      setTimeout(function () {
        connect();
        if (state.tabId !== null) {
          send({ kind: "watch", tabId: state.tabId });
        }
      }, 300);
    });
  }
  function send(msg) {
    if (!port) {
      connect();
    }
    port.postMessage(msg);
  }
  function onMessage(msg) {
    if (msg.kind === "history" && msg.tabId === state.tabId) {
      state.events = msg.events || [];
      state.live = msg.live;
      state.gate = msg.gate || null;
      render();
    } else if (msg.kind === "gate") {
      state.gate = msg.gate;
      updateStatus();
      if (!logEl.childElementCount) {
        render();
      }
    } else if (msg.kind === "sync") {
      showSync(msg);
    } else if (msg.kind === "status") {
      state.live = msg.live;
      updateStatus();
    } else if (msg.kind === "event") {
      state.live = true;
      state.events.push(msg.event);
      if (state.events.length > 3000) {
        state.events.splice(0, state.events.length - 3000);
      }
      if (state.paused) {
        state.held++;
        updateStatus();
        return;
      }
      if (matches(msg.event)) {
        const top = logEl.firstElementChild;
        if (top && top._key === key(msg.event)) {
          bump(top, msg.event);
          updateCounts();
          updateStatus();
          return;
        }
        logEl.prepend(row(msg.event, true));
        while (logEl.childElementCount > SHOW_MAX) {
          logEl.lastElementChild.remove();
        }
        emptyEl.hidden = true;
      }
      updateCounts();
      updateStatus();
    }
  }

  /* ---- which tab ---- */
  function watch(tab) {
    const url = (tab && tab.url) || "";
    state.tabId = tab ? tab.id : null;
    state.tabUrl = url;
    state.events = [];
    state.live = false;
    state.gate = null;
    pageEl.textContent = url || "This page can’t be recorded";
    pageEl.title = url;
    if (state.tabId !== null) {
      send({ kind: "watch", tabId: state.tabId });
    }
    render();
  }
  function followActive() {
    chrome.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      watch(tabs[0]);
    });
  }
  const fixed = Number(new URLSearchParams(location.search).get("tab"));
  if (fixed) {
    chrome.tabs.get(fixed).then(watch, function () {
      watch(null);
    });
  } else {
    followActive();
    chrome.tabs.onActivated.addListener(followActive);
  }
  chrome.tabs.onUpdated.addListener(function (id, change, tab) {
    if (id === state.tabId && change.url) {
      state.tabUrl = tab.url || "";
      pageEl.textContent = state.tabUrl || "This page can’t be recorded";
      pageEl.title = state.tabUrl;
      updateStatus();
    }
  });

  /* ---- drawing ---- */
  // Identical actions in a row (the app checks /api/listener every few seconds) share one row
  // with a count; expanding it shows the latest.
  function key(ev) {
    const d = ev.detail || {};
    return ev.type + "|" + (ev.type === "net" ? d.method + " " + d.url + " " + d.status : ev.summary);
  }
  function bump(li, ev) {
    li._events.push(ev);
    li._key = key(ev);
    li.querySelector(".time").textContent = timeFmt.format(ev.t);
    let badge = li.querySelector(".times");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "times";
      li.querySelector(".sum").appendChild(badge);
    }
    badge.textContent = "×" + countFmt.format(li._events.length);
    badge.setAttribute("aria-label", li._events.length + " times");
    const s = li.querySelector(".sum").firstChild;
    s.textContent = ev.summary;
  }
  function matches(ev) {
    if (!state.shown.has(ev.type) || (ev.frame && !state.frames)) {
      return false;
    }
    if (!state.query) {
      return true;
    }
    return (ev.summary + " " + ev.url + " " + JSON.stringify(ev.detail || "")).toLowerCase().includes(state.query);
  }

  function row(ev, fresh) {
    const t = BY_ID[ev.type] || { short: ev.type, c: "--muted" };
    const li = document.createElement("li");
    if (ev.type === "error" || (ev.type === "net" && ev.detail && ev.detail.status >= 400)) {
      li.className = "is-error";
    }
    if (fresh && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      li.classList.add("is-new");
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "row";
    btn.setAttribute("aria-expanded", "false");
    btn.style.setProperty("--c", "var(" + t.c + ")");
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = timeFmt.format(ev.t);
    const type = document.createElement("span");
    type.className = "type";
    type.textContent = t.short;
    const sum = document.createElement("span");
    sum.className = "sum";
    sum.appendChild(document.createTextNode(ev.summary));
    li._events = [ev];
    li._key = key(ev);
    btn.append(time, type, sum);
    btn.addEventListener("click", function () {
      const opened = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!opened));
      const next = li.querySelector(".detail");
      if (opened) {
        if (next) {
          next.remove();
        }
      } else {
        li.appendChild(detail(li._events[li._events.length - 1]));
      }
    });
    li.appendChild(btn);
    return li;
  }

  function detail(ev) {
    const box = document.createElement("div");
    box.className = "detail";
    const dl = document.createElement("dl");
    const add = function (k, v) {
      if (v === undefined || v === null || v === "") {
        return;
      }
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = typeof v === "string" ? v : JSON.stringify(v);
      dl.append(dt, dd);
    };
    add("When", whenFmt.format(ev.t));
    add("Page", ev.url);
    const d = ev.detail || {};
    if (ev.type === "net") {
      add("Request", d.method + " " + d.url);
      add("Status", d.status);
      add("Time", d.ms + " ms");
    }
    if (d.target) {
      add("Element", d.target.tag + (d.target.id ? "#" + d.target.id : "") + (d.target.class ? "." + d.target.class.replace(/ /g, ".") : ""));
    }
    box.appendChild(dl);
    if (ev.detail) {
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(ev.detail, null, 2);
      box.appendChild(pre);
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn copy";
      copy.textContent = "Copy Details";
      copy.addEventListener("click", function () {
        navigator.clipboard.writeText(JSON.stringify(ev, null, 2)).then(function () {
          copy.textContent = "Copied";
          setTimeout(function () {
            copy.textContent = "Copy Details";
          }, 1500);
        });
      });
      box.appendChild(copy);
    }
    return box;
  }

  function render() {
    // build oldest to newest so repeats fold onto the newest row, then show newest first
    const rows = [];
    for (let i = 0; i < state.events.length; i++) {
      const ev = state.events[i];
      if (!matches(ev)) {
        continue;
      }
      const last = rows[rows.length - 1];
      if (last && last._key === key(ev)) {
        bump(last, ev);
      } else {
        rows.push(row(ev, false));
      }
    }
    const frag = document.createDocumentFragment();
    let n = 0;
    for (let i = rows.length - 1; i >= 0 && n < SHOW_MAX; i--) {
      frag.appendChild(rows[i]);
      n++;
    }
    logEl.replaceChildren(frag);
    emptyEl.hidden = n > 0;
    if (!n) {
      emptyEl.innerHTML = emptyText();
    }
    for (const t of TYPES) {
      chips[t.id].setAttribute("aria-pressed", String(state.shown.has(t.id)));
    }
    updateCounts();
    updateStatus();
  }

  function emptyText() {
    if (!TARGET.test(state.tabUrl)) {
      return "<strong>Chrome doesn’t let extensions record this page.</strong>Browser pages (<code>chrome://</code>, the new tab page, the Chrome Web Store) are off limits. Switch to any website and its actions show up here.";
    }
    if (!state.live) {
      return "<strong>Reload the page to start logging.</strong>The log begins when the page loads with the extension installed.";
    }
    if (state.gate && !state.gate.education) {
      return "<strong>Not recording: this page doesn’t look like school work.</strong>The extension keeps checking every few seconds. Open a lesson, homework, a course or SkillBridge and recording starts by itself.";
    }
    if (state.events.length) {
      return "<strong>No actions match.</strong>Turn on more types above or clear the search.";
    }
    return "<strong>No actions yet.</strong>Click, type or move around the page: every action and network call appears here, newest first.";
  }

  function updateCounts() {
    const counts = {};
    for (const ev of state.events) {
      counts[ev.type] = (counts[ev.type] || 0) + 1;
    }
    for (const t of TYPES) {
      chips[t.id].querySelector("b").textContent = countFmt.format(counts[t.id] || 0);
      chips[t.id].setAttribute("aria-label", t.label + ", " + (counts[t.id] || 0) + " actions");
    }
  }

  function updateStatus() {
    const total = countFmt.format(state.events.length) + " actions";
    let text;
    if (!TARGET.test(state.tabUrl)) {
      text = "Can’t record this page";
    } else if (state.paused) {
      text = "Paused · " + countFmt.format(state.held) + " new";
    } else if (state.gate && !state.gate.education) {
      text = "Watching · not school work";
    } else if (state.live) {
      text = "Recording · " + total;
    } else {
      text = "Not recording";
    }
    statusEl.textContent = text;
    const rec = state.live && !state.paused && TARGET.test(state.tabUrl) && !(state.gate && !state.gate.education);
    statusEl.classList.toggle("is-live", rec);
    gateEl.hidden = !TARGET.test(state.tabUrl);
    gateEl.classList.toggle("is-on", !!(state.gate && state.gate.education));
    gateEl.replaceChildren();
    const b = document.createElement("b");
    if (!state.gate) {
      b.textContent = "Checking";
      gateEl.append(b, " whether this page is school work…");
    } else if (state.gate.education) {
      b.textContent = "School work: recording.";
      gateEl.append(b, " " + reasonText(state.gate.reasons));
    } else {
      b.textContent = "Not school work: not recording.";
      gateEl.append(b, " Checking again every 5 seconds." + (state.gate.reasons.length ? " Found " + reasonText(state.gate.reasons).replace(/^Because of /, "") : ""));
    }
  }

  function reasonText(reasons) {
    return reasons && reasons.length ? "Because of " + reasons.join("; ") + "." : "";
  }

  function showSync(msg) {
    const s = msg.sync || {};
    syncEl.classList.toggle("is-bad", s.ok === false);
    syncEl.replaceChildren();
    if (s.ok === false) {
      syncEl.append("Start SkillBridge (python run.py) to save: " + countFmt.format(msg.pending) + " actions waiting.");
    } else {
      const code = document.createElement("code");
      code.textContent = "data/action-log/";
      syncEl.append("Saved " + countFmt.format(s.saved || 0) + " actions to SkillBridge ", code, msg.pending ? " · " + countFmt.format(msg.pending) + " waiting" : "");
    }
  }

  connect();
})();
