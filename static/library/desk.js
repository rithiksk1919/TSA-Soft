/* SkillBridge: the reading desk (Apply).
   A tabletop in CSS 3D. The camera sits down at the desk; a classmate's worked solution is dealt
   onto it one step at a time; a tutor talks the learner through reading the problem, judging each
   step, finding the wrong one, saying why, and fixing it. The desk lamp is the tutor's pointer: its
   light springs to whatever the tutor is talking about.
   The tutor is scripted (data/desk.json): no AI is connected yet. Its replies stream in like a live
   agent's so the UI can be judged as it will feel.
   Flat (no 3D) below 820px and with reduced motion. Progress persists in localStorage "sb_desk". */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, $ = ui.$, $$ = ui.$$, esc = ui.esc;

  var el = $("#desk"), stage = $("#dk-stage"), cam = $("#dk-cam"), table = $("#dk-top"),
    paper = $("#dk-paper"), list = $("#dk-cards"), spot = $("#dk-spot"), swing = $("#dk-swing"), lampEl = $("#dk-lamp"),
    log = $("#tutor-log"), choices = $("#tutor-choices"), form = $("#tutor-form"), input = $("#tutor-input"),
    hintBtn = $("#tutor-hint"), status = $("#tutor-status"), tabs = $("#desk-tabs"), phaseEls = $$(".desk__phase", el),
    closeBtn = $("#desk-close"), title = $("#desk-title"), tutorEl = $("#tutor");

  var KEY = "sb_desk", CANCEL = { cancelled: true };
  var data = null, loading = null, isOpen = false, opening = false, closeQueued = false, release = null, run = null, seq = 0, queue = Promise.resolve();
  var saved = load();

  function load() {
    try { var v = JSON.parse(localStorage.getItem(KEY)); if (v && v.v === 1 && v.done) return v; } catch (e) { /* storage blocked */ }
    return { v: 1, done: {} };
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* in-memory only */ } }

  var ICON = {
    check: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    cross: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    pen: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 13l1-3.5L10.5 3 13 5.5 6.5 12 3 13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>'
  };

  /* =====================================================================
     Camera: k = 0 standing back from the desk, 1 seated at it
     ===================================================================== */

  var view = { k: 1, yaw: 0, fit: 1 };
  function paintCam() {
    if (ui.flat()) { cam.style.transform = ""; return; }
    var k = view.k;
    cam.style.transform = "translateY(" + ui.lerp(150, 0, k).toFixed(1) + "px) scale(" + (ui.lerp(0.62, 1, k) * view.fit).toFixed(4) + ") rotateY(" +
      view.yaw.toFixed(2) + "deg) rotateX(" + ui.lerp(64, 22, k).toFixed(2) + "deg)";
  }
  var seat = SB.createSpring(P.camera, function (k) { view.k = k; paintCam(); }, 1);
  var yaw = SB.createSpring({ stiffness: 60, damping: 14 }, function (y) { view.yaw = y; paintCam(); }, 0);

  stage.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || ui.flat()) return;
    var r = stage.getBoundingClientRect();
    yaw.to(((e.clientX - r.left) / r.width - 0.5) * -3.5);
  });
  stage.addEventListener("pointerleave", function () { if (!ui.flat()) yaw.to(0); });

  function fit() {
    if (!isOpen) return;
    if (ui.flat()) {
      view.fit = 1; stage.style.height = ""; stage.style.perspective = "";
      ["--stage-h", "--wall-end", "--floor-start"].forEach(function (k) { el.style.removeProperty(k); });
      paintCam(); return;
    }
    // The near edge projects wider than the layout box (perspective), so leave room for it. On large
    // screens the desk grows to fill the space under the bar, by width and by height, up to 1.35x.
    var docked = innerWidth < 1100;
    var top = stage.getBoundingClientRect().top + el.scrollTop;
    var room = innerHeight - top - 24 - (docked ? (parseFloat(el.style.getPropertyValue("--dock-h")) || 0) : 0);
    // The perspective scales with the desk, so the whole view zooms uniformly: seated, the table
    // projects about 1.1x as tall as its layout box and 1.2x as wide at the near edge.
    var byW = (stage.clientWidth - 8) / (table.offsetWidth * 1.2);
    var byH = room / (table.offsetHeight * 1.1);
    view.fit = Math.min(byW, docked ? 1 : Math.max(1, Math.min(1.35, byH)));
    stage.style.perspective = Math.round(1500 * view.fit) + "px";
    var seen = Math.round(table.offsetHeight * view.fit * 1.1);
    stage.style.height = seen + "px";
    // The room behind the desk: the wainscot rises just above the far edge, the floor shows below.
    el.style.setProperty("--stage-h", seen + "px");
    el.style.setProperty("--wall-end", Math.round(top + seen * 0.12) + "px");
    el.style.setProperty("--floor-start", Math.round(top + seen * 0.62) + "px");
    paintCam();
    lampAt = centerIn(lampEl);
    paintSpot();
  }
  window.addEventListener("resize", fit);
  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      el.style.setProperty("--dock-h", (innerWidth < 1100 ? tutorEl.offsetHeight : 0) + "px");
      if (isOpen && !ui.flat()) fit();
    }).observe(tutorEl);
  }

  /* =====================================================================
     The lamp and its light
     ===================================================================== */

  var lampAt = { x: 0, y: 0 }, spotAt = { x: 220, y: 300 };
  function paintSpot() {
    spot.style.transform = "translate3d(" + (spotAt.x - 1100).toFixed(1) + "px," + (spotAt.y - 1100).toFixed(1) + "px,0)";
    var a = Math.atan2(spotAt.y - lampAt.y, spotAt.x - lampAt.x) * 180 / Math.PI;
    swing.style.transform = "rotateZ(" + a.toFixed(1) + "deg)";
  }
  var sx = SB.createSpring(P.camera, function (x) { spotAt.x = x; paintSpot(); }, 220);
  var sy = SB.createSpring(P.camera, function (y) { spotAt.y = y; paintSpot(); }, 300);

  // Centre of an element in tabletop coordinates (layout space, before the 3D transform).
  function centerIn(node) {
    var x = node.offsetWidth / 2, y = node.offsetHeight / 2;
    for (var n = node; n && n !== table; n = n.offsetParent) { x += n.offsetLeft; y += n.offsetTop; }
    return { x: x, y: y };
  }

  // Point at something: light it, lift it, and light the figure parts named.
  function point(f) {
    f = f || {};
    $$(".is-lit", table).forEach(function (n) { n.classList.remove("is-lit"); });
    if (f.el) f.el.classList.add("is-lit");
    var fig = $(".dk-fig", paper), parts = f.parts || [];
    if (fig) {
      fig.classList.toggle("has-lit", parts.length > 0);
      $$("[data-parts]", fig).forEach(function (n) {
        n.classList.toggle("is-lit", n.dataset.parts.split(" ").some(function (p) { return parts.indexOf(p) >= 0; }));
      });
    }
    if (!f.el || ui.flat() || !isOpen) return;
    var c = centerIn(f.el);
    sx.to(c.x); sy.to(c.y);
  }

  /* =====================================================================
     Figures: drawn per scenario; parts are lit by name, data-fix holds the corrected text
     ===================================================================== */

  function arrow(x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy), ux = dx / L, uy = dy / L;
    var bx = x2 - ux * 8, by = y2 - uy * 8, f = function (n) { return n.toFixed(1); };
    return '<line class="fig-ln" x1="' + f(x1) + '" y1="' + f(y1) + '" x2="' + f(bx) + '" y2="' + f(by) + '"/>' +
      '<path class="fig-ah" d="M' + f(x2) + " " + f(y2) + "L" + f(bx - uy * 4) + " " + f(by + ux * 4) + "L" + f(bx + uy * 4) + " " + f(by - ux * 4) + 'Z"/>';
  }
  function txt(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '"' + (o.end ? ' text-anchor="end"' : o.mid ? ' text-anchor="middle"' : "") +
      (o.fix ? ' data-fix="' + esc(o.fix) + '"' : "") + ">" + esc(s) + "</text>";
  }
  var FIGS = {
    incline: function () {
      return '<svg viewBox="0 0 320 190" role="img" aria-label="A block on a 30 degree incline, with its weight mg, the normal force N, friction f, and the weight split into mg cos theta and mg sin theta.">' +
        '<path class="fig-ground" d="M10 170.5H310"/>' +
        '<path class="fig-solid" d="M30 170L290 170L290 20Z"/>' +
        '<g data-parts="theta"><path class="fig-ln" d="M70 170A40 40 0 0 0 64.6 150"/>' + txt(76, 163, "30°") + "</g>" +
        '<g class="fig-block"><rect transform="translate(164 72) rotate(-30)" x="-18" y="-18" width="36" height="36" rx="2"/></g>' +
        '<g class="fig-dash" data-parts="cos">' + arrow(164, 72, 192, 120.5) + txt(198, 128, "mg cos θ") + "</g>" +
        '<g class="fig-dash" data-parts="sin">' + arrow(164, 72, 129.4, 92) + txt(124, 104, "mg sin θ", { end: true }) + "</g>" +
        '<g data-parts="mg">' + arrow(164, 72, 164, 146) + txt(158, 160, "mg", { end: true }) + "</g>" +
        '<g data-parts="N">' + arrow(164, 72, 134, 20) + txt(127, 20, "N", { end: true }) + "</g>" +
        '<g data-parts="f">' + arrow(164, 72, 207, 47) + txt(212, 44, "f") + "</g>" +
        "</svg>";
    },
    chain: function () {
      function box(x, y, s, part, o) {
        o = o || {};
        return '<g data-parts="' + part + '"' + (o.bad ? ' class="is-bad" data-fix-class="is-good"' : "") + '><rect class="fig-box" x="' + x + '" y="' + y + '" width="104" height="44" rx="4"/>' +
          txt(x + 52, y + 27, s, { mid: true, fix: o.fix }) + "</g>";
      }
      return '<svg viewBox="0 0 340 186" role="img" aria-label="The conversion chain: grams of oxygen, to moles of oxygen, to moles of water, to grams of water.">' +
        box(8, 20, "8.0 g O₂", "A") + box(228, 20, "0.25 mol O₂", "B") + box(228, 124, "0.50 mol H₂O", "C") +
        box(8, 124, "0.028 g H₂O", "D", { bad: true, fix: "9.0 g H₂O" }) +
        '<g data-parts="AB">' + arrow(114, 42, 224, 42) + txt(169, 33, "÷ 32.00 g/mol", { mid: true }) + "</g>" +
        '<g data-parts="BC">' + arrow(280, 66, 280, 120) + txt(270, 97, "× 2 mol H₂O / 1 mol O₂", { end: true }) + "</g>" +
        '<g data-parts="CD" class="is-bad" data-fix-class="is-good">' + arrow(224, 146, 114, 146) + txt(169, 137, "÷ 18.02 g/mol", { mid: true, fix: "× 18.02 g/mol" }) + "</g>" +
        "</svg>";
    },
    codons: function () {
      var dna = ["TAC", "AAG", "CCT", "ATT", "GCA"], rna = ["AUG", "UUC", "GGA", "UAA", "CGU"], aa = ["Met", "Phe", "Gly", "—", "Arg"];
      var fixAa = [null, null, null, "Stop", null];
      var rows = [["dna", "Template 3′", dna, 34], ["mrna", "mRNA 5′", rna, 84], ["aa", "Protein", aa, 134]];
      var s = '<svg viewBox="0 0 340 156" role="img" aria-label="Codon table: template strand TAC AAG CCT ATT GCA, mRNA AUG UUC GGA UAA CGU, and the amino acids read from it.">';
      rows.forEach(function (r) {
        s += '<g data-parts="' + r[0] + '">' + txt(0, r[3] + 4, r[1]) + "</g>";
        r[2].forEach(function (c, i) {
          var x = 76 + i * 53, cls = "", fix = null;
          if (r[0] === "aa" && i === 3) { cls = ' class="is-bad" data-fix-class="is-good"'; fix = fixAa[i]; }
          if (r[0] === "aa" && i === 4) cls = ' class="is-bad" data-fix-class="is-void"';
          s += '<g data-parts="c' + (i + 1) + " " + r[0] + '"' + cls + '><rect class="fig-cell" x="' + x + '" y="' + (r[3] - 15) + '" width="47" height="30" rx="3"/>' +
            txt(x + 23.5, r[3] + 4, c, { mid: true, fix: fix }) + "</g>";
        });
      });
      return s + "</svg>";
    }
  };
  // Figures for the Python and circuits desk problems (added alongside the original three).
  function wireBox(x, y, w, h, label, part) {
    return '<g data-parts="' + part + '"><rect class="fig-box" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3"/>' +
      txt(x + w / 2, y + h / 2 + 4, label, { mid: true }) + "</g>";
  }
  function battery(x, y) {
    return '<g data-parts="vs"><path class="fig-ln" d="M' + (x - 14) + " " + (y - 8) + "H" + (x + 14) + "M" + (x - 8) + " " + (y + 6) + "H" + (x + 8) + '"/>' +
      txt(x - 22, y + 4, "12 V", { end: true }) + "</g>";
  }
  FIGS.series = function () {
    return '<svg viewBox="0 0 320 190" role="img" aria-label="A 12 volt battery, a 100 ohm resistor and a 200 ohm resistor in one series loop, with the current I.">' +
      '<g data-parts="loop"><path class="fig-ln" d="M60 40H290V150H60V108M60 82V40"/></g>' + battery(60, 95) +
      wireBox(120, 28, 70, 24, "100 Ω", "rtotal") + wireBox(150, 138, 70, 24, "200 Ω", "rtotal") +
      '<g data-parts="I">' + arrow(215, 40, 262, 40) + txt(238, 30, "I", { mid: true }) + "</g></svg>";
  };
  FIGS.branches = function () {
    return '<svg viewBox="0 0 320 190" role="img" aria-label="A 12 volt supply with two 60 ohm resistors on separate parallel branches, and the supply current I.">' +
      '<g data-parts="branches"><path class="fig-ln" d="M60 50H290M60 140H290M290 50V140M60 50V82M60 108V140"/></g>' + battery(60, 95) +
      wireBox(150, 38, 70, 24, "60 Ω", "branches rtotal") + wireBox(150, 128, 70, 24, "60 Ω", "branches rtotal") +
      '<g data-parts="I">' + arrow(80, 50, 126, 50) + txt(103, 40, "I", { mid: true }) + "</g></svg>";
  };
  FIGS.trace = function () {
    var rows = [["rng", "range(1, 5)", [1, 2, 3, 4, 5], 50], ["tot", "total after", [1, 3, 6, 10, 15], 110]];
    var s = '<svg viewBox="0 0 340 156" role="img" aria-label="The classmate’s trace: loop values 1 2 3 4 5 and running totals 1 3 6 10 15.">';
    rows.forEach(function (r) {
      s += '<g data-parts="' + r[0] + '">' + txt(0, r[3] + 4, r[1]) + "</g>";
      r[2].forEach(function (c, i) {
        var x = 86 + i * 50;
        var bad = i === 4 ? ' class="is-bad" data-fix-class="is-void"' : "";
        s += '<g data-parts="c' + (i + 1) + " " + r[0] + '"' + bad + '><rect class="fig-cell" x="' + x + '" y="' + (r[3] - 15) + '" width="44" height="30" rx="3"/>' +
          txt(x + 22, r[3] + 4, String(c), { mid: true }) + "</g>";
      });
    });
    return s + "</svg>";
  };
  function fixFigure() {
    var fig = $(".dk-fig", paper);
    if (!fig) return;
    $$("[data-fix]", fig).forEach(function (n) { n.textContent = n.dataset.fix; });
    $$("[data-fix-class]", fig).forEach(function (n) { n.classList.remove("is-bad"); n.classList.add(n.dataset.fixClass); });
  }

  /* =====================================================================
     Rendering
     ===================================================================== */

  function subjectOf(sc) {
    var s = SB.store.subject && SB.store.subject(sc.subject);
    return s || { name: sc.subject.charAt(0).toUpperCase() + sc.subject.slice(1), accent: "var(--ink)" };
  }

  function renderPaper(sc) {
    var subj = subjectOf(sc);
    paper.innerHTML =
      '<p class="dk-paper__call"><span translate="no">' + esc(sc.call) + "</span><span>" + esc(subj.name) + " · " + esc(sc.skill) + "</span></p>" +
      '<h2 class="dk-paper__title">' + esc(sc.title) + "</h2>" +
      '<p class="dk-paper__kind">Find the wrong step</p>' +
      '<p class="dk-paper__problem">' + esc(sc.problem) + "</p>" +
      '<figure class="dk-fig">' + FIGS[sc.figure]() + "</figure>" +
      '<dl class="dk-ans">' +
      '<div class="dk-ans__row dk-ans__row--theirs"><dt>Classmate’s answer</dt><dd>' + esc(sc.theirs) + "</dd></div>" +
      '<div class="dk-ans__row"><dt>Answer key</dt><dd>' + esc(sc.key) + "</dd></div></dl>";
  }

  function renderTabs() {
    var cur = run && run.sc.id;
    tabs.innerHTML = data.scenarios.map(function (sc) {
      var subj = subjectOf(sc), done = !!saved.done[sc.id];
      return '<button class="chip-btn" type="button" data-id="' + sc.id + '" style="--sub:' + subj.accent + '" aria-pressed="' + (sc.id === cur) + '">' +
        esc(subj.name) + (done ? ICON.check + '<span class="visually-hidden"> (done)</span>' : "") + "</button>";
    }).join("");
  }

  var PHASES = ["read", "check", "fix", "reflect"];
  function setPhase(p, statusText) {
    run.phase = p;
    var at = PHASES.indexOf(p === "why" ? "fix" : p);
    phaseEls.forEach(function (li, i) {
      li.classList.toggle("is-done", i < at);
      if (i === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    if (statusText) status.textContent = statusText;
    updateHint();
  }

  function hintKey() { return { read: "read", check: "check", why: "fix", fix: "fix" }[run && run.phase] || null; }
  function updateHint() {
    var key = hintKey(), all = key ? run.sc.hints[key] : [], used = key ? (run.hintAt[key] || 0) : 0, left = Math.max(0, all.length - used);
    hintBtn.disabled = !key;
    hintBtn.textContent = key ? "Hint" + (left ? " (" + left + " left)" : "") : "Hint";
  }

  /* =====================================================================
     The tutor: one queue, so messages never interleave
     ===================================================================== */

  function check(t) { if (!run || run.token !== t) throw CANCEL; }
  function scrollLog() { log.scrollTop = log.scrollHeight; }
  function bubble(kind, text) {
    var p = document.createElement("p");
    p.className = "tmsg tmsg--" + kind;
    p.textContent = text;
    log.appendChild(p);
    scrollLog();
    return p;
  }
  function me(text) { bubble("me", text); }

  function say(text, o) {
    var t = run.token;
    var p = queue.then(function () { return speak(text, o || {}, t); });
    queue = p.catch(function () {});
    return p;
  }
  function speak(text, o, t) {
    check(t);
    if (o.focus) point(o.focus);
    el.classList.add("is-thinking");
    var b = bubble(o.hint ? "tutor tmsg--hint" : "tutor", "");
    b.classList.add("is-typing");
    b.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="visually-hidden">Tutor is writing</span>';
    scrollLog();
    return ui.wait(o.think || Math.min(900, 320 + text.length * 2)).then(function () {
      check(t);
      b.classList.remove("is-typing");
      return stream(b, text, t);
    }).then(function () {
      el.classList.remove("is-thinking");
      ui.announce("Tutor: " + text);
    });
  }
  function stream(b, text, t) {
    if (SB.reducedMotion()) { b.textContent = text; scrollLog(); return Promise.resolve(); }
    return new Promise(function (resolve, reject) {
      var i = 0;
      (function step() {
        if (!run || run.token !== t) { reject(CANCEL); return; }
        i = Math.min(text.length, i + 3);
        b.textContent = text.slice(0, i);
        scrollLog();
        if (i < text.length) setTimeout(step, 16); else resolve();
      })();
    });
  }

  // Offer choices in the tutor panel. onPick(i, button) may return true to keep them showing.
  function offer(label, opts, onPick) {
    choices.innerHTML = '<p class="tutor__ask">' + esc(label) + "</p>" + opts.map(function (o, i) {
      return '<button class="tchoice' + (o.primary ? " tchoice--primary" : "") + '" type="button" data-i="' + i + '"><span class="tchoice__k" aria-hidden="true">' +
        String.fromCharCode(65 + i) + "</span><span>" + esc(o.label) + "</span></button>";
    }).join("");
    choices.onclick = function (e) {
      var b = e.target.closest(".tchoice");
      if (!b || b.disabled) return;
      if (!onPick(+b.dataset.i, b)) clearChoices();
    };
    scrollLog();
    var first = $(".tchoice", choices);
    if (first && isOpen && mayMoveFocus()) first.focus({ preventScroll: true });
  }
  // Follow the conversation with focus only when focus is already in it (a choice or judge button
  // that just went away, or nowhere): never pull it off the title or the text box.
  function mayMoveFocus() {
    var a = document.activeElement;
    return !a || a === document.body || (el.contains(a) && a !== title && a !== input && !tabs.contains(a));
  }
  function clearChoices() { choices.innerHTML = ""; choices.onclick = null; scrollLog(); }

  // A question with one right option. Wrong picks are struck out and answered; resolves when right.
  function ask(q, focus) {
    var t = run.token;
    return say(q.question, { focus: focus }).then(function () {
      check(t);
      return new Promise(function (resolve) {
        offer("Choose one", q.options.map(function (o) { return { label: o }; }), function (i, b) {
          me(q.options[i]);
          if (i === q.answer) { resolve(); return false; }
          run.misses++;
          b.disabled = true;
          var next = $(".tchoice:not(:disabled)", choices);
          say(q.wrong, { focus: focus }).then(function () { if (next && document.activeElement === document.body) next.focus({ preventScroll: true }); }, function () {});
          return true;
        });
      });
    }).then(function () { return say(q.right, { focus: focus }); });
  }

  /* =====================================================================
     Cards on the desk
     ===================================================================== */

  function deal(n, text, state, extra) {
    var li = document.createElement("li");
    li.className = "dk-card" + (state === "rule" ? " dk-card--rule" : "");
    li.dataset.state = state || "dealt";
    var label = state === "rule" ? "Rule to remember" : state === "after" ? "Step " + n : "Step " + n;
    li.innerHTML = '<p class="dk-card__top"><span>' + label + '</span><span class="dk-card__tag"></span></p>' +
      '<p class="dk-card__text">' + esc(text) + "</p>" + (extra || "") +
      (state === "dealt" ? '<div class="dk-card__judge" role="group" aria-label="Judge step ' + n + '" hidden>' +
        '<button class="ibtn" type="button" data-v="ok">Looks right</button>' +
        '<button class="ibtn" type="button" data-v="wrong">Something’s off</button></div>' : "");
    if (state === "after") tag(li, ICON.pen + "Redone with your fix");
    list.appendChild(li);
    if (isOpen) li.scrollIntoView({ block: "nearest", behavior: SB.reducedMotion() ? "auto" : "smooth" });
    if (SB.reducedMotion()) return Promise.resolve(li);
    var flat = ui.flat();
    var s = SB.createSpring(P.drawer, function (k) {
      var q = 1 - k;
      li.style.opacity = ui.clamp(k * 2.5, 0, 1).toFixed(3);
      li.style.transform = flat
        ? "translateY(" + (q * 18).toFixed(1) + "px)"
        : "translate3d(" + (q * 320).toFixed(1) + "px," + (q * -60).toFixed(1) + "px," + (Math.sin(Math.min(k, 1) * Math.PI) * 70).toFixed(1) + "px) rotateZ(" + (q * 9).toFixed(2) + "deg)";
    }, 0);
    return s.to(1).then(function () { li.style.transform = ""; li.style.opacity = ""; return li; });
  }
  function tag(card, html) { $(".dk-card__tag", card).innerHTML = html; }
  function mark(card, state) {
    card.dataset.state = state;
    if (state === "ok") tag(card, ICON.check + "Holds up");
    if (state === "wrong") {
      tag(card, ICON.cross + "Wrong step");
      var ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      ring.setAttribute("class", "dk-ring" + (SB.reducedMotion() ? "" : " is-drawing"));
      ring.setAttribute("viewBox", "0 0 100 40");
      ring.setAttribute("preserveAspectRatio", "none");
      ring.setAttribute("aria-hidden", "true");
      ring.innerHTML = '<ellipse cx="50" cy="20" rx="49" ry="19" pathLength="1" transform="rotate(-1.5 50 20)"/>';
      $(".dk-card__text", card).appendChild(ring);
    }
  }
  function judge(card) {
    var row = $(".dk-card__judge", card);
    row.hidden = false;
    // The buttons make the card taller: re-aim the light at its new centre.
    if (card.classList.contains("is-lit") && !ui.flat()) { var c = centerIn(card); sx.to(c.x); sy.to(c.y); }
    status.textContent = "Waiting for your call on " + $(".dk-card__top span", card).textContent.toLowerCase();
    var first = $("button", row);
    if (isOpen) {
      if (mayMoveFocus()) first.focus({ preventScroll: true });
      card.scrollIntoView({ block: "nearest", behavior: SB.reducedMotion() ? "auto" : "smooth" });
    }
    return new Promise(function (resolve) {
      row.onclick = function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        row.hidden = true;
        row.onclick = null;
        resolve(b.dataset.v);
      };
    });
  }
  function shake(card) {
    if (SB.reducedMotion()) return;
    var s = SB.createSpring(P.stuck, function (x) { card.style.translate = x.toFixed(1) + "px 0"; }, 0);
    s.kick(-320).then(function () { card.style.translate = ""; });
  }
  // Rewrite a card: it tips up edge-on, the line changes, it settles back down.
  function rewrite(card, text, was) {
    function swap() {
      card.dataset.state = "fixed";
      tag(card, ICON.check + "Fixed");
      var ring = $(".dk-ring", card);
      if (ring) ring.remove();
      $(".dk-card__text", card).textContent = text;
      var w = document.createElement("p");
      w.className = "dk-card__was";
      w.innerHTML = '<span class="visually-hidden">Was: </span>' + esc(was);
      $(".dk-card__text", card).after(w);
    }
    if (SB.reducedMotion()) { swap(); return Promise.resolve(); }
    var s = SB.createSpring(P.flip, function (d) { card.style.rotate = "x " + d.toFixed(2) + "deg"; }, 0);
    s.to(90);
    return s.near(3).then(function () {
      swap();
      s.jump(-90);
      return s.to(0);
    }).then(function () { card.style.rotate = ""; });
  }
  function stampPaper() {
    var st = document.createElement("span");
    st.className = "dk-stamp";
    st.textContent = "Applied";
    paper.appendChild(st);
    if (SB.reducedMotion()) return Promise.resolve();
    var s = SB.createSpring(P.pop, function (k) {
      st.style.opacity = ui.clamp(k * 3, 0, 1).toFixed(3);
      st.style.transform = "rotate(-8deg) scale(" + ui.lerp(1.9, 1, k).toFixed(3) + ")";
    }, 0);
    return s.to(1).then(function () { st.style.transform = ""; st.style.opacity = ""; });
  }

  /* =====================================================================
     The scenario, start to finish
     ===================================================================== */

  function play() {
    var t = run.token, sc = run.sc, wrongCard = null, wrongStep = null, n = 0;
    var c = function (v) { check(t); return v; };
    var pFocus = { el: paper };

    setPhase("read", "Reading the problem with you");
    var p = Promise.resolve();
    sc.intro.forEach(function (line) { p = p.then(function () { return say(line, { focus: pFocus }); }); });
    p = p.then(function () { return ask(sc.read, pFocus); }).then(c);

    // Check: deal the classmate's steps one at a time, up to the wrong one.
    p = p.then(function () { setPhase("check", "Checking the steps with you"); return say(sc.check, { focus: { el: list.parentElement } }); });
    sc.steps.forEach(function (st) {
      p = p.then(function () {
        if (wrongCard) return;
        n++;
        status.textContent = "Laying out step " + n;
        return deal(n, st.text, "dealt").then(c).then(function (card) {
          var focus = { el: card, parts: st.focus };
          return say(st.say, { focus: focus }).then(function () { return judgeStep(card, st, focus); });
        });
      });
    });
    function judgeStep(card, st, focus) {
      return judge(card).then(c).then(function (v) {
        if (st.wrong) {
          if (v === "wrong") { me("Something’s off here."); mark(card, "wrong"); wrongCard = card; wrongStep = st; return say(st.caught, { focus: focus }); }
          me("Looks right to me."); run.misses++; shake(card);
          return say(st.missed, { focus: focus }).then(function () { return judgeStep(card, st, focus); });
        }
        if (v === "ok") { me("Looks right to me."); mark(card, "ok"); return say(st.ok, { focus: focus }); }
        me("Something’s off here."); run.misses++; shake(card); mark(card, "ok");
        return say(st.nudge, { focus: focus });
      });
    }

    // Fix: why it is wrong, then the corrected line; the card is rewritten and the sketch updated.
    p = p.then(function () {
      var focus = { el: wrongCard, parts: wrongStep.focus };
      setPhase("why", "Working out why step " + n + " fails");
      return ask(sc.why, focus).then(c).then(function () {
        setPhase("fix", "Fixing step " + n + " with you");
        return ask(sc.fix, focus);
      }).then(c).then(function () { return rewrite(wrongCard, sc.fixed, wrongStep.text); }).then(c).then(function () {
        fixFigure();
        point({ el: wrongCard, parts: wrongStep.focus });
      });
    });
    // The rest of the solution, redone from the fix.
    sc.after.forEach(function (st) {
      p = p.then(function () {
        n++;
        status.textContent = "Redoing step " + n + " with your fix";
        return deal(n, st.text, "after").then(c).then(function (card) { return say(st.say, { focus: { el: card, parts: st.focus } }); });
      });
    });

    // Reflect: the answer, the stamp, the rule, the way on.
    p = p.then(function () {
      setPhase("reflect", "Wrapping up");
      $(".dk-ans__row--theirs", paper).classList.add("is-struck");
      var yours = document.createElement("div");
      yours.className = "dk-ans__row dk-ans__row--yours";
      yours.innerHTML = "<dt>Your corrected answer</dt><dd>" + esc(sc.result) + "</dd>";
      $(".dk-ans", paper).appendChild(yours);
      point({ el: paper });
      return stampPaper();
    }).then(c).then(function () {
      var stats = '<p class="dk-card__stats">' + ui.plural(run.hintsUsed, "hint") + " · " + ui.plural(run.misses, "miss", "misses") + "</p>";
      return deal("", sc.rule, "rule", stats);
    }).then(c).then(function (card) {
      saved.done[sc.id] = { hints: run.hintsUsed, misses: run.misses, date: new Date().toISOString().slice(0, 10) };
      save();
      renderTabs();
      var praise = run.misses === 0 && run.hintsUsed === 0 ? "Clean run: no hints and no misses." :
        "You got there with " + ui.plural(run.hintsUsed, "hint") + " and " + ui.plural(run.misses, "miss", "misses") + ".";
      return say(praise + " Here’s the rule to keep: " + sc.rule, { focus: { el: card } });
    }).then(c).then(function () {
      setPhase("done", "Done. Pick what’s next");
      phaseEls.forEach(function (li) { li.classList.add("is-done"); li.removeAttribute("aria-current"); });
      var next = nextScenario(sc.id);
      var opts = [];
      if (next) opts.push({ label: "Next scenario: " + subjectOf(next).name, primary: true, go: function () { start(next.id); } });
      opts.push({ label: "Try this one again", go: function () { start(sc.id); } });
      opts.push({ label: "Back to the library", go: close });
      offer("What next?", opts, function (i) { opts[i].go(); return false; });
    });
    return p.catch(function (e) { if (e !== CANCEL) throw e; });
  }

  function nextScenario(id) {
    var list = data.scenarios, i = list.findIndex(function (s) { return s.id === id; });
    for (var k = 1; k < list.length; k++) { var s = list[(i + k) % list.length]; if (!saved.done[s.id]) return s; }
    return list[(i + 1) % list.length];
  }

  /* ---------- Hints and free questions (mock agent) ---------- */

  function hint() {
    if (!run) return;
    var key = hintKey();
    if (!key) return;
    var all = run.sc.hints[key], at = run.hintAt[key] || 0;
    if (at >= all.length) { say(run.data.tutor.hintsOut).catch(function () {}); return; }
    run.hintAt[key] = at + 1;
    run.hintsUsed++;
    updateHint();
    say(all[at], { hint: true }).catch(function () {});
  }
  hintBtn.addEventListener("click", function () { me("Can I have a hint?"); hint(); });

  function reply(q) {
    var s = q.toLowerCase(), sc = run.sc, T = run.data.tutor;
    if (/\b(hint|stuck|help|clue)\b/.test(s)) { hint(); return; }
    if (/\b(answer|solution|tell me|give me|just say)\b/.test(s)) { say(T.noSpoil, { think: 700 }).catch(function () {}); hint(); return; }
    for (var i = 0; i < sc.faq.length; i++) {
      if (sc.faq[i].match.some(function (m) { return s.indexOf(m.toLowerCase()) >= 0; })) { say(sc.faq[i].reply, { think: 800 }).catch(function () {}); return; }
    }
    if (/\b(why|explain|how|understand|confus|mean)/.test(s) && hintKey()) { say("Good question. Let me point you at it rather than tell you.", { think: 700 }).catch(function () {}); hint(); return; }
    say(T.fallback, { think: 600 }).catch(function () {});
  }
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var q = input.value.trim();
    if (!q || !run) return;
    input.value = "";
    me(q);
    reply(q);
  });

  /* =====================================================================
     Start, open, close
     ===================================================================== */

  function start(id) {
    var sc = data.scenarios.filter(function (s) { return s.id === id; })[0] || data.scenarios[0];
    seq++;
    run = { sc: sc, data: data, token: seq, phase: "read", hintAt: {}, hintsUsed: 0, misses: 0 };
    queue = Promise.resolve();
    el.classList.remove("is-thinking");
    el.style.setProperty("--sub", subjectOf(sc).accent);
    log.innerHTML = "";
    clearChoices();
    list.innerHTML = "";
    renderPaper(sc);
    renderTabs();
    requestAnimationFrame(function () {
      lampAt = centerIn(lampEl);
      var c = centerIn(paper);
      sx.jump(c.x); sy.jump(c.y);
    });
    play();
  }

  function ensureData() {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = Promise.all([
        fetch("data/desk.json").then(function (r) { if (!r.ok) throw new Error("data/desk.json " + r.status); return r.json(); }),
        SB.store.ready
      ]).then(function (r) { data = r[0]; return data; });
    }
    return loading;
  }

  function firstOpen() {
    var s = data.scenarios.filter(function (x) { return !saved.done[x.id]; })[0];
    return (s || data.scenarios[0]).id;
  }

  function open(opts) {
    opts = opts || {};
    return ensureData().then(function () {
      if (isOpen) return;
      isOpen = true;
      el.hidden = false;
      release = ui.isolate([el]);
      history.replaceState(null, "", "#desk");
      fit();
      if (!run) start(firstOpen());
      title.focus({ preventScroll: true });
      ui.announce("The reading desk. Find the wrong step in a classmate’s solution, with the tutor.");
      // Resolves once the desk is showing; the camera keeps sitting down after that.
      opening = true;
      if (opts.instant || ui.flat()) seat.jump(1); else { seat.jump(0); seat.to(1); }
      return ui.fade(el, 0, 1).then(function () {
        opening = false;
        // A close asked for during the fade-in runs now, after the room has seen the hand-off.
        if (closeQueued) { closeQueued = false; Promise.resolve().then(close); }
      });
    });
  }

  function close() {
    if (!isOpen) return Promise.resolve();
    if (opening) { closeQueued = true; return Promise.resolve(); }
    isOpen = false;
    seq++;
    run = null;
    clearChoices();
    el.classList.remove("is-thinking");
    // Put the room back behind the desk before it fades, so the flat page underneath never shows.
    if (release) { release(); release = null; }
    if (SB.room && SB.room.back) SB.room.back({ under: true });
    var out = ui.flat() ? ui.fade(el, 1, 0) : Promise.all([seat.to(0), ui.wait(220).then(function () { return ui.fade(el, 1, 0); })]);
    return out.then(function () {
      el.hidden = true;
      el.style.opacity = "";
    });
  }

  closeBtn.addEventListener("click", close);
  tabs.addEventListener("click", function (e) {
    var b = e.target.closest("[data-id]");
    if (b && (!run || run.sc.id !== b.dataset.id)) start(b.dataset.id);
  });
  document.addEventListener("keydown", function (e) {
    // Handled here only: the room's own Esc listener must not also run for this press.
    if (e.key === "Escape" && isOpen) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  });

  SB.desk = {
    open: open,
    close: close,
    isOpen: function () { return isOpen; },
    opening: function () { return opening; },
    // For tests: the current scenario and phase.
    debug: function () { return run ? { id: run.sc.id, phase: run.phase, hints: run.hintsUsed, misses: run.misses } : null; },
    reset: function () { saved = { v: 1, done: {} }; save(); }
  };
})();
