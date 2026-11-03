/* SkillBridge shared UI helpers: DOM shortcuts, announcements, focus isolation, components. */
(function () {
  "use strict";
  var SB = window.SkillBridge = window.SkillBridge || {};

  var ui = {};
  ui.$ = function (s, r) { return (r || document).querySelector(s); };
  ui.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  ui.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  ui.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  ui.lerp = function (a, b, t) { return a + (b - a) * t; };
  ui.wait = function (ms) { return new Promise(function (r) { setTimeout(r, SB.reducedMotion && SB.reducedMotion() ? 0 : ms); }); };
  ui.num = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ui.plural = function (n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); };

  ui.announce = function (msg) {
    var a = document.getElementById("announcer");
    if (!a) return;
    a.textContent = "";
    setTimeout(function () { a.textContent = msg; }, 30);
  };

  // Flat mode: below 820px or with reduced motion there is no 3D camera or cabinet.
  var narrow = window.matchMedia("(max-width: 819px)");
  ui.flat = function () { return narrow.matches || (SB.reducedMotion && SB.reducedMotion()); };
  ui.narrow = function () { return narrow.matches; };
  function syncFlat() { document.documentElement.classList.toggle("sb-flat", ui.flat()); }
  syncFlat();
  narrow.addEventListener("change", syncFlat);
  window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", syncFlat);

  // A 150ms crossfade, the reduced-motion stand-in for any physical motion.
  ui.fade = function (el, from, to) {
    var a = el.animate([{ opacity: from }, { opacity: to }], { duration: 150, fill: "both" });
    return a.finished.then(function () { el.style.opacity = to === 1 ? "" : String(to); a.cancel(); }, function () {});
  };

  /* ---------- Focus isolation (modal trap) ----------
     Everything outside the given nodes becomes inert, so Tab cannot leave them and screen
     readers do not wander off. Nesting is supported: release() restores the previous layer. */
  var stack = [];
  ui.isolate = function (keep) {
    keep = keep.filter(Boolean);
    var changed = [];
    // A nested layer may sit inside what an outer layer made inert: lift that for its own path.
    var lifted = [];
    keep.forEach(function (node) {
      for (var n = node; n && n !== document.body; n = n.parentElement) {
        if (n.inert) { n.inert = false; lifted.push(n); }
      }
    });
    keep.forEach(function (node) {
      var n = node;
      while (n && n.parentElement && n !== document.body) {
        Array.prototype.forEach.call(n.parentElement.children, function (sib) {
          if (keep.some(function (k) { return sib === k || sib.contains(k) || k.contains(sib); })) return;
          if (sib.tagName === "SCRIPT" || sib.id === "announcer") return;
          if (!sib.inert && changed.indexOf(sib) < 0) { sib.inert = true; changed.push(sib); }
        });
        n = n.parentElement;
      }
    });
    var layer = { changed: changed, keep: keep };
    stack.push(layer);
    return function release() {
      var i = stack.indexOf(layer);
      if (i < 0) return;
      stack.splice(i, 1);
      changed.forEach(function (sib) { sib.inert = false; });
      lifted.forEach(function (n) { n.inert = true; });
      // Re-apply outer layers in case they shared nodes with this one.
      stack.forEach(function (l) { l.changed.forEach(function (sib) { sib.inert = true; }); });
    };
  };

  // Tab wraps inside the top layer, so focus never leaves to the browser chrome and back.
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function tabbables(nodes) {
    var out = [];
    nodes.forEach(function (n) {
      ui.$$(FOCUSABLE, n).forEach(function (x) {
        if (x.closest("[inert]") || x.closest("[hidden]")) return;
        var r = x.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (getComputedStyle(x).visibility === "hidden") return;
        out.push(x);
      });
    });
    // Tab order is document order, whatever order the kept nodes were given in.
    return out.sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !stack.length) return;
    var top = stack[stack.length - 1];
    var list = tabbables(top.keep);
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
    else if (!e.shiftKey && (i === list.length - 1 || i < 0)) { e.preventDefault(); list[0].focus(); }
  }, true);

  /* ---------- Shared components (markup builders) ---------- */

  // Subject chips: All + one per subject. Rendered as toggle buttons with aria-pressed.
  ui.chips = function (subjects, current, opts) {
    opts = opts || {};
    var all = opts.all !== false ? '<button class="chip-btn" type="button" data-subject="" aria-pressed="' + (!current) + '">All</button>' : "";
    return '<div class="chip-row" role="group" aria-label="' + ui.esc(opts.label || "Filter by subject") + '">' + all +
      subjects.map(function (s) {
        return '<button class="chip-btn" type="button" data-subject="' + s.id + '" style="--sub:' + s.accent + '" aria-pressed="' + (current === s.id) + '">' + ui.esc(s.name) + "</button>";
      }).join("") + "</div>";
  };

  // A catalog divider heading for a group of index cards.
  ui.divider = function (subject, meta) {
    return '<div class="divider-row pop" style="--sub:' + subject.accent + '"><span class="divider-row__tab">' + ui.esc(subject.name) + "</span>" +
      (meta ? '<span class="divider-row__meta">' + ui.esc(meta) + "</span>" : "") + "</div>";
  };

  // The Leitner tray strip: counts per box.
  ui.trays = function (counts) {
    return '<p class="trays" aria-label="Card boxes">' + window.SBLogic.BOXES.map(function (b) {
      return '<span class="tray"><span class="tray__n">' + counts[b.id] + '</span> ' + ui.esc(b.name) + "</span>";
    }).join("") + "</p>";
  };

  SB.ui = ui;
})();
