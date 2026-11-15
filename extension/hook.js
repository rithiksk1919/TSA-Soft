// Runs inside every page and frame (the page's own JavaScript world) before the page's scripts,
// so it sees everything the person does and everything the page does in reply. Each action is
// handed to relay.js as a "sb-action-log" event on the document; relay.js forwards it to the
// extension. Nothing here changes how the page behaves.
(function () {
  if (window.__sbActionLog) {
    return;
  }
  window.__sbActionLog = true;

  const MAX_BODY = 4000;
  // Actions inside an iframe are marked with the frame's site.
  let FRAME = "";
  try {
    FRAME = window.top === window ? "" : "[frame " + (location.host || location.protocol) + "] ";
  } catch (error) {
    FRAME = "[frame] ";
  }

  // Actions wait in a queue until relay.js is listening (the two scripts can start in either order).
  let ready = false;
  const queue = [];
  document.addEventListener("sb-action-log-ready", function () {
    ready = true;
    while (queue.length) {
      document.dispatchEvent(new CustomEvent("sb-action-log", { detail: queue.shift() }));
    }
  });
  document.dispatchEvent(new CustomEvent("sb-action-log-hello"));

  function send(type, summary, detail) {
    try {
      const event = { t: Date.now(), type: type, summary: (FRAME + String(summary)).slice(0, 300), url: location.href, frame: !!FRAME, detail: detail || null };
      if (!ready) {
        queue.push(JSON.stringify(event));
        return;
      }
      document.dispatchEvent(new CustomEvent("sb-action-log", { detail: JSON.stringify(event) }));
    } catch (error) {
      /* an action that cannot be described is skipped, never breaks the page */
    }
  }

  function clip(text) {
    text = String(text == null ? "" : text);
    return text.length > MAX_BODY ? text.slice(0, MAX_BODY) + "… (" + text.length + " chars)" : text;
  }

  // Response bodies: parsed as JSON when they are (up to 50 KB), otherwise kept as clipped text.
  function body50k(text) {
    return parse(text && text.length > 50000 ? clip(text) : text);
  }

  function parse(text) {
    if (typeof text !== "string" || !text) {
      return text == null ? null : String(text);
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return clip(text);
    }
  }

  // A short readable name for an element: its role and its words.
  const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role], [data-room], [tabindex], [contenteditable]";
  function target(el) {
    if (!el || el.nodeType !== 1) {
      return null;
    }
    const hit = el.closest(INTERACTIVE) || el;
    const info = { tag: hit.tagName.toLowerCase() };
    if (hit.id) {
      info.id = hit.id;
    }
    const cls = typeof hit.className === "string" ? hit.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    if (cls.length) {
      info.class = cls.join(" ");
    }
    const label = hit.getAttribute("aria-label");
    if (label) {
      info.label = label;
    }
    // words only for things a person clicks or reads as one item, not whole sections of the page
    const small = hit !== el || /^(A|BUTTON|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY|OPTION|LI|TD|TH|H[1-6]|P|SPAN|B|STRONG|I|EM|IMG|CODE)$/.test(hit.tagName);
    // Form fields are named by their label, never by what is typed in them.
    let text = "";
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(hit.tagName)) {
      const lab = hit.labels && hit.labels[0] ? hit.labels[0].innerText : "";
      const buttonish = hit.tagName === "INPUT" && /^(button|submit|reset)$/.test(hit.type);
      text = (lab || hit.getAttribute("placeholder") || hit.getAttribute("title") || (buttonish ? hit.value : "") || "").replace(/\s+/g, " ").trim();
    } else if (small) {
      text = (hit.innerText || hit.getAttribute("title") || "").replace(/\s+/g, " ").trim();
    }
    if (text) {
      info.text = text.slice(0, 100);
    }
    if (hit.getAttribute("href")) {
      info.href = hit.getAttribute("href");
    }
    if (hit.name) {
      info.name = hit.name;
    }
    if (hit.type && hit.tagName !== "BUTTON") {
      info.type = hit.type;
    }
    for (const attr of hit.attributes) {
      if (attr.name.startsWith("data-") && Object.keys(info).length < 12) {
        info[attr.name] = attr.value.slice(0, 80);
      }
    }
    return info;
  }

  function name(info) {
    if (!info) {
      return "page";
    }
    const words = info.label || info.text || info.name || info.id || info["data-room"] || info.class || "";
    return info.tag + (words ? " “" + words.slice(0, 60) + "”" : "");
  }

  // Fields whose contents are never recorded: passwords, card details, one-time codes.
  function isSecret(el) {
    if (!el || !el.getAttribute) {
      return false;
    }
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    const nm = ((el.name || "") + " " + (el.id || "")).toLowerCase();
    return el.type === "password" || /cc-|one-time-code|current-password|new-password/.test(ac) || /passw|card.?num|cvc|cvv|(^|[^a-z])(otp|pin)([^a-z]|$)/.test(nm);
  }

  function isTextField(el) {
    if (!el) {
      return false;
    }
    if (el.isContentEditable || el.tagName === "TEXTAREA") {
      return true;
    }
    return el.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/.test(el.type);
  }

  /* ---- pointer and keyboard ---- */
  document.addEventListener("click", function (ev) {
    const info = target(ev.target);
    const btn = ["left", "middle", "right"][ev.button] || "button " + ev.button;
    send("click", (btn === "left" ? "Click " : btn + " click ") + name(info), { target: info, x: ev.clientX, y: ev.clientY, button: btn, keys: mods(ev) });
  }, true);
  document.addEventListener("dblclick", function (ev) {
    const info = target(ev.target);
    send("click", "Double-click " + name(info), { target: info });
  }, true);
  document.addEventListener("contextmenu", function (ev) {
    const info = target(ev.target);
    send("click", "Right-click " + name(info), { target: info });
  }, true);

  function mods(ev) {
    const m = [];
    if (ev.ctrlKey) {
      m.push("Ctrl");
    }
    if (ev.altKey) {
      m.push("Alt");
    }
    if (ev.shiftKey) {
      m.push("Shift");
    }
    if (ev.metaKey) {
      m.push("Meta");
    }
    return m;
  }

  // Keys: every key outside text fields (the gym's games use B/C and 1-4), and in text fields only
  // keys that do something (Enter, Escape, Tab, arrows, shortcuts); typing itself is logged as input.
  document.addEventListener("keydown", function (ev) {
    if (ev.repeat) {
      return;
    }
    const m = mods(ev);
    const printable = ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey;
    // Enter sends a message in chat boxes, which then clear: record the text first
    if (ev.key === "Enter" && isTextField(ev.target)) {
      flushTyping(ev.target);
    }
    if ((printable && isTextField(ev.target)) || (isSecret(ev.target) && ev.key.length === 1)) {
      return;
    }
    if (/^(Shift|Control|Alt|Meta)$/.test(ev.key)) {
      return;
    }
    const combo = m.concat([ev.key === " " ? "Space" : ev.key]).join("+");
    send("key", "Key " + combo + (ev.target && ev.target !== document.body ? " on " + name(target(ev.target)) : ""), { key: ev.key, code: ev.code, keys: m, target: target(ev.target) });
  }, true);

  /* ---- form input ---- */
  // Typing is recorded half a second after it stops (or at once when Enter is pressed), as the
  // field's whole text. A field cleared after sending is not recorded as empty.
  const pending = new WeakMap();
  const lastSent = new WeakMap();
  function typed(el) {
    const value = isSecret(el) ? "(hidden)" : el.isContentEditable ? el.innerText : el.value;
    const text = String(value).replace(/\s+$/, "");
    if (!text || lastSent.get(el) === text) {
      return;
    }
    lastSent.set(el, text);
    send("input", "Typed into " + name(target(el)) + ": “" + text.slice(0, 80) + "”", { target: target(el), value: clip(text) });
  }
  function flushTyping(el) {
    clearTimeout(pending.get(el));
    pending.delete(el);
    typed(el);
  }
  document.addEventListener("input", function (ev) {
    const el = ev.target;
    if (!isTextField(el)) {
      return;
    }
    clearTimeout(pending.get(el));
    pending.set(el, setTimeout(function () {
      typed(el);
    }, 500));
  }, true);
  document.addEventListener("focusout", function (ev) {
    if (pending.has(ev.target)) {
      flushTyping(ev.target);
    }
  }, true);
  document.addEventListener("change", function (ev) {
    const el = ev.target;
    if (isTextField(el)) {
      return;
    }
    let value = el.value;
    if (el.type === "checkbox" || el.type === "radio") {
      value = el.checked ? "checked" : "unchecked";
    } else if (el.tagName === "SELECT") {
      value = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
    }
    if (isSecret(el)) {
      value = "(hidden)";
    }
    send("input", "Changed " + name(target(el)) + " to “" + String(value).slice(0, 80) + "”", { target: target(el), value: value });
  }, true);
  document.addEventListener("submit", function (ev) {
    send("input", "Submitted form " + name(target(ev.target)), { target: target(ev.target) });
  }, true);

  /* ---- focus and hover (rooms play a moment on hover) ---- */
  document.addEventListener("focusin", function (ev) {
    send("focus", "Focus " + name(target(ev.target)), { target: target(ev.target) });
  }, true);
  let lastHover = null;
  document.addEventListener("pointerover", function (ev) {
    const el = ev.target && ev.target.closest ? ev.target.closest("[data-room], a, button, [role=button]") : null;
    if (!el || el === lastHover) {
      return;
    }
    lastHover = el;
    send("hover", "Hover " + name(target(el)), { target: target(el) });
  }, true);
  document.addEventListener("pointerout", function (ev) {
    if (lastHover && !lastHover.contains(ev.relatedTarget)) {
      lastHover = null;
    }
  }, true);

  /* ---- navigation ---- */
  send("nav", "Page opened: " + location.pathname + location.search + location.hash, { referrer: document.referrer || null });
  window.addEventListener("hashchange", function (ev) {
    const u = new URL(ev.newURL);
    send("nav", "Moved to " + (u.hash || u.pathname), { from: ev.oldURL, to: ev.newURL });
  });
  window.addEventListener("popstate", function () {
    send("nav", "Back/forward to " + location.pathname + location.hash, { to: location.href });
  });
  for (const fn of ["pushState", "replaceState"]) {
    const orig = history[fn];
    history[fn] = function (state, title, url) {
      const out = orig.apply(this, arguments);
      send("nav", (fn === "pushState" ? "Moved to " : "Replaced URL with ") + (url || location.href), { state: state, to: location.href });
      return out;
    };
  }
  window.addEventListener("beforeunload", function () {
    send("nav", "Leaving " + location.pathname, null);
  });
  document.addEventListener("visibilitychange", function () {
    send("nav", document.hidden ? "Tab hidden" : "Tab visible", null);
  });

  /* ---- network: every fetch and XHR, with request and response bodies ---- */
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const started = performance.now();
    const method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
    const body = init && typeof init.body === "string" ? parse(init.body) : init && init.body ? "(" + Object.prototype.toString.call(init.body).slice(8, -1) + ")" : null;
    return origFetch.apply(this, arguments).then(function (res) {
      const ms = Math.round(performance.now() - started);
      const ctype = (res.headers.get("content-type") || "").toLowerCase();
      const size = Number(res.headers.get("content-length") || 0);
      const readable = /json|text|xml|javascript|graphql|x-www-form/.test(ctype) && !/event-stream/.test(ctype) && size < 2000000;
      if (!readable) {
        send("net", method + " " + shortUrl(url) + " → " + res.status + " (" + ms + " ms)", { method: method, url: url, status: res.status, ms: ms, request: body, response: "(" + (ctype || "no type") + (size ? ", " + size + " bytes" : "") + ", not recorded)" });
        return res;
      }
      res.clone().text().then(function (text) {
        send("net", method + " " + shortUrl(url) + " → " + res.status + " (" + ms + " ms)", { method: method, url: url, status: res.status, ms: ms, request: body, response: body50k(text) });
      }, function () {
        send("net", method + " " + shortUrl(url) + " → " + res.status + " (" + ms + " ms)", { method: method, url: url, status: res.status, ms: ms, request: body });
      });
      return res;
    }, function (error) {
      send("error", method + " " + shortUrl(url) + " failed: " + error.message, { method: method, url: url, request: body });
      throw error;
    });
  };
  const XO = XMLHttpRequest.prototype.open;
  const XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__sb = { method: String(method).toUpperCase(), url: String(url) };
    return XO.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const info = this.__sb || { method: "GET", url: "" };
    const started = performance.now();
    const xhr = this;
    this.addEventListener("loadend", function () {
      const ms = Math.round(performance.now() - started);
      let response = null;
      try {
        response = xhr.responseType === "" || xhr.responseType === "text" ? body50k(xhr.responseText) : "(" + xhr.responseType + ")";
      } catch (error) {
        response = null;
      }
      send(xhr.status ? "net" : "error", info.method + " " + shortUrl(info.url) + " → " + (xhr.status || "failed") + " (" + ms + " ms)", { method: info.method, url: info.url, status: xhr.status, ms: ms, request: typeof body === "string" ? parse(body) : null, response: response });
    });
    return XS.apply(this, arguments);
  };
  function shortUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname + u.search : u.href;
    } catch (error) {
      return url;
    }
  }

  /* ---- errors and console warnings ---- */
  window.addEventListener("error", function (ev) {
    if (ev.target && ev.target !== window && ev.target.tagName) {
      send("error", "Failed to load " + ev.target.tagName.toLowerCase() + " " + (ev.target.src || ev.target.href || ""), null);
      return;
    }
    send("error", "Error: " + ev.message, { file: ev.filename, line: ev.lineno, column: ev.colno, stack: ev.error && ev.error.stack });
  }, true);
  window.addEventListener("unhandledrejection", function (ev) {
    const r = ev.reason;
    send("error", "Unhandled promise rejection: " + (r && r.message ? r.message : String(r)), { stack: r && r.stack });
  });
  for (const level of ["error", "warn"]) {
    const orig = console[level];
    console[level] = function () {
      const text = Array.prototype.map.call(arguments, function (a) {
        if (a instanceof Error) {
          return a.message;
        }
        if (typeof a === "object") {
          try {
            return JSON.stringify(a);
          } catch (error) {
            return String(a);
          }
        }
        return String(a);
      }).join(" ");
      send("error", "console." + level + ": " + text, { level: level });
      return orig.apply(this, arguments);
    };
  }

  /* ---- speech (the listening desk reads aloud) ---- */
  if (window.speechSynthesis) {
    const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = function (u) {
      send("speech", "Speaking: “" + String(u && u.text).slice(0, 100) + "”", { text: u && u.text, rate: u && u.rate, lang: u && u.lang });
      return speak(u);
    };
    const cancel = window.speechSynthesis.cancel.bind(window.speechSynthesis);
    window.speechSynthesis.cancel = function () {
      send("speech", "Speech stopped", null);
      return cancel();
    };
  }

  /* ---- browser storage the app writes ---- */
  for (const store of ["localStorage", "sessionStorage"]) {
    try {
      const s = window[store];
      const set = s.setItem.bind(s);
      const remove = s.removeItem.bind(s);
      Object.defineProperty(s, "setItem", { value: function (k, v) {
        send("storage", store + " set " + k + " = " + String(v).slice(0, 80), { store: store, key: k, value: parse(String(v)) });
        return set(k, v);
      } });
      Object.defineProperty(s, "removeItem", { value: function (k) {
        send("storage", store + " removed " + k, { store: store, key: k });
        return remove(k);
      } });
    } catch (error) {
      /* storage blocked: nothing to log */
    }
  }
  const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (cookieDesc && cookieDesc.set) {
    Object.defineProperty(document, "cookie", {
      get: function () {
        return cookieDesc.get.call(document);
      },
      set: function (v) {
        send("storage", "Cookie set: " + String(v).split(";")[0], { cookie: v });
        cookieDesc.set.call(document, v);
      },
      configurable: true
    });
  }

  /* ---- what the page tells the learner: toasts, live regions, dialogs ---- */
  function watchLive() {
    const seen = new WeakMap();
    const obs = new MutationObserver(function (records) {
      for (const rec of records.slice(0, 200)) {
        let node = rec.target.nodeType === 1 ? rec.target : rec.target.parentElement;
        const region = node && node.closest ? node.closest("[aria-live], [role=status], [role=alert], dialog[open], [role=dialog]") : null;
        // pages can opt out a region (SkillBridge's own mistakes panel, which shows this log)
        if (!region || region.closest("[data-action-log-ignore]")) {
          continue;
        }
        const text = (region.innerText || "").replace(/\s+/g, " ").trim();
        if (!text || seen.get(region) === text || region.hidden) {
          continue;
        }
        seen.set(region, text);
        const kind = region.matches("dialog, [role=dialog]") ? "Dialog" : region.getAttribute("role") === "alert" ? "Alert" : "Message";
        send("ui", kind + ": " + text.slice(0, 160), { target: target(region), text: clip(text) });
      }
    });
    obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "open"] });
  }
  if (document.documentElement) {
    watchLive();
  } else {
    document.addEventListener("readystatechange", watchLive, { once: true });
  }

  /* ---- AI chat replies (ChatGPT and others): what the assistant said, once it stops typing ---- */
  // Replies arrive as a stream, so the network log cannot keep them. Instead, every second the
  // page's chat messages are read; a reply is recorded when its text has stopped changing.
  const REPLY = '[data-message-author-role="assistant"], [data-testid="assistant-message"], .font-claude-message, model-response, [data-is-streaming]';
  const replies = new WeakMap();   // element -> { text, still, sent }
  let replyScans = 0;
  let sentAt = 0;
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && !ev.shiftKey && isTextField(ev.target)) {
      sentAt = Date.now();
    }
  }, true);
  document.addEventListener("click", function (ev) {
    const b = ev.target && ev.target.closest ? ev.target.closest("button") : null;
    if (b && /send|submit/i.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("data-testid") || "") + " " + b.innerText)) {
      sentAt = Date.now();
    }
  }, true);
  setInterval(function () {
    const nodes = document.querySelectorAll(REPLY);
    if (!nodes.length) {
      return;
    }
    replyScans++;
    // On the first scan, replies already on the page (an old chat being opened) are not new,
    // unless a message has been sent from this page already.
    const first = replyScans === 1 && !sentAt;
    for (const el of Array.from(nodes).slice(-6)) {
      const text = (el.innerText || "").replace(/\s+\n/g, "\n").trim();
      if (!text) {
        continue;
      }
      const seen = replies.get(el);
      if (!seen) {
        replies.set(el, { text: text, still: 0, sent: first ? text : "" });
        continue;
      }
      if (seen.text !== text) {
        seen.text = text;
        seen.still = 0;
        continue;
      }
      seen.still++;
      if (seen.still >= 2 && seen.sent !== text) {
        seen.sent = text;
        send("ui", "Assistant said: " + text.replace(/\s+/g, " ").slice(0, 200), { role: "assistant", text: clip(text) });
      }
    }
  }, 1000);
})();
