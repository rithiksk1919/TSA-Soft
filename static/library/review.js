/* SkillBridge flashcard review: one overlay, shared by the 3D fan (desktop) and the sheet (narrow).
   Multiple choice, verified instantly; each answer moves the card by the Leitner rule (logic.nextBox). */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, L = window.SBLogic, store = SB.store;
  var $ = ui.$, $$ = ui.$$, esc = ui.esc;

  var root = document.getElementById("review");
  var el = {
    scrim: $(".review__scrim", root), title: $("#review-title", root), fly: $(".rcard-fly", root),
    card: $(".rcard", root), front: $(".rcard__front", root), back: $(".rcard__back", root), actions: $(".review__actions", root)
  };

  var run = null;          // { list, i, results, from, onExit, release }
  var flyFrom = null;
  var flip = SB.createSpring(P.flip, function (x) { el.card.style.transform = "rotateY(" + (x * 180).toFixed(2) + "deg)"; }, 0);
  var fly = SB.createSpring(P.drawer, function (k) {
    if (!flyFrom) return;
    el.fly.style.transform = "translate(" + (flyFrom.dx * k).toFixed(2) + "px," + (flyFrom.dy * k).toFixed(2) + "px) scale(" + (1 + (flyFrom.sc - 1) * k).toFixed(4) + ")";
    el.scrim.style.opacity = (0.34 * ui.clamp(1 - k, 0, 1)).toFixed(3);
    el.fly.style.opacity = flyFrom.fade ? ui.clamp(1 - k, 0, 1).toFixed(3) : "";
  }, 1);

  function measure(from) {
    el.fly.style.transform = "none";
    var b = el.fly.getBoundingClientRect();
    if (from && from.isConnected) {
      var a = from.getBoundingClientRect();
      if (a.width > 0) return { dx: a.left + a.width / 2 - (b.left + b.width / 2), dy: a.top + a.height / 2 - (b.top + b.height / 2), sc: Math.max(0.2, a.width / b.width), fade: false };
    }
    return { dx: 0, dy: 28, sc: 0.96, fade: true };
  }

  function letter(k) { return String.fromCharCode(65 + k); }

  function faces(front) {
    el.front.inert = !front; el.front.setAttribute("aria-hidden", String(!front));
    el.back.inert = front; el.back.setAttribute("aria-hidden", String(front));
  }
  function focusHeading(face) {
    var h = $(".rcard__h", face);
    if (h) h.focus({ preventScroll: true });
  }
  function setActions(list) {
    el.actions.innerHTML = list.map(function (a, i) {
      return '<button class="rbtn' + (a.primary ? " rbtn--primary" : "") + '" type="button" data-a="' + i + '">' + esc(a.label) + "</button>";
    }).join("");
    $$(".rbtn", el.actions).forEach(function (b) { b.addEventListener("click", function () { list[+b.dataset.a].run(); }); });
  }

  function meta(card, right) {
    return '<div class="rcard__meta"><span><b>' + esc(card.mistake.call) + "</b> · " + esc(card.subject.name) + "</span><span>" + right + "</span></div>";
  }

  function frontHTML(i) {
    var c = run.list[i];
    return meta(c, "Card " + (i + 1) + " of " + run.list.length + " · " + esc(L.boxName(store.box(c.id)))) +
      '<p class="rcard__label">' + esc(c.mistake.title) + "</p>" +
      '<h2 class="rcard__text rcard__h" tabindex="-1">' + esc(c.prompt) + "</h2>" +
      '<div class="ropts" role="group" aria-label="Answer choices">' +
      c.options.map(function (o, k) {
        return '<button class="ropt" type="button" data-k="' + k + '"><span class="ropt__key">' + letter(k) + "</span><span>" + esc(o) + "</span></button>";
      }).join("") + "</div>";
  }

  function moveText(mv) {
    if (mv.from === mv.to) return "Stays in " + L.boxName(mv.to) + ".";
    return "Moved from " + L.boxName(mv.from) + " to " + L.boxName(mv.to) + ".";
  }

  function backHTML(i, res) {
    var c = run.list[i];
    var verdict = res.correct
      ? '<p class="rresult rresult--ok"><span class="rresult__mark" aria-hidden="true">✓</span> Correct</p>'
      : '<p class="rresult rresult--no"><span class="rresult__mark" aria-hidden="true">✕</span> Not quite. The answer is ' + letter(c.answer) + ", " + esc(c.options[c.answer]) + ".</p>";
    return meta(c, "Card " + (i + 1) + " of " + run.list.length) +
      verdict +
      '<p class="rcard__answer rcard__h" tabindex="-1">' + esc(c.explain) + "</p>" +
      '<p class="rmove">' + esc(moveText(res)) + "</p>";
  }

  function endHTML() {
    var n = run.results.length;
    var ok = run.results.filter(function (r) { return r.correct; }).length;
    var counts = L.leitnerCounts(run.list.map(function (c) { return c.id; }), store.review.boxes);
    var up = run.results.filter(function (r) { return r.to > r.from; }).length;
    var down = run.results.filter(function (r) { return r.to < r.from; }).length;
    return '<div class="rcard__meta"><span><b>' + esc(run.title) + "</b></span><span>Done</span></div>" +
      '<p class="rcard__label">Session results</p>' +
      '<h2 class="rcard__text rcard__h" tabindex="-1" id="review-summary">' + ui.plural(n, "card") + " reviewed: " + ok + " correct, " + (n - ok) + " not quite.</h2>" +
      '<p class="rmove">' + ui.plural(up, "card") + " moved up a box, " + ui.plural(down, "card") + " went back to To review.</p>" +
      ui.trays(counts);
  }

  function bindOptions() {
    $$(".ropt", el.front).forEach(function (b) {
      b.addEventListener("click", function () { choose(+b.dataset.k); });
    });
  }

  function showCard(i, animate) {
    run.i = i;
    run.answered = false;
    el.front.innerHTML = frontHTML(i);
    bindOptions();
    faces(true);
    setActions([]);
    var done = animate ? flip.to(0) : (flip.jump(0), Promise.resolve());
    focusHeading(el.front);
    ui.announce("Card " + (i + 1) + " of " + run.list.length + ".");
    return done;
  }

  function choose(k) {
    if (!run || run.answered) return;
    run.answered = true;
    var c = run.list[run.i];
    var correct = k === c.answer;
    var mv = store.answer(c.id, correct);
    var res = { id: c.id, correct: correct, from: mv.from, to: mv.to };
    run.results.push(res);
    $$(".ropt", el.front).forEach(function (b) {
      var kk = +b.dataset.k;
      b.disabled = true;
      if (kk === c.answer) b.classList.add("is-right");
      if (kk === k && !correct) b.classList.add("is-wrong");
    });
    el.back.innerHTML = backHTML(run.i, res);
    faces(false);
    flip.to(1);
    focusHeading(el.back);
    var last = run.i === run.list.length - 1;
    setActions([{ label: last ? "See Results" : "Next Card", primary: true, run: last ? finish : function () { showCard(run.i + 1, true); } }]);
    ui.announce((correct ? "Correct. " : "Not quite. ") + moveText(res));
  }

  function finish() {
    el.front.innerHTML = endHTML();
    faces(true);
    flip.to(0);
    focusHeading(el.front);
    setActions([
      { label: "Review Again", run: function () { run.results = []; showCard(0, false); } },
      { label: "Back to Drawer", primary: true, run: exit }
    ]);
    ui.announce(run.results.length + " cards reviewed.");
  }

  // opts: { cards, title, from (element to fly from/back to), onExit(fromElement) }
  function open(opts) {
    if (run || !opts.cards || !opts.cards.length) return Promise.resolve();
    run = { list: opts.cards.slice(), i: 0, results: [], title: opts.title || "Flashcards", from: opts.from || null, onExit: opts.onExit };
    root.hidden = false;
    el.title.textContent = run.title + " · " + ui.plural(run.list.length, "card");
    root.style.setProperty("--sub", run.list[0].subject.accent);
    showCard(0, false);
    run.release = ui.isolate([root]);
    if (opts.from) opts.from.style.visibility = "hidden";
    if (SB.reducedMotion()) {
      flyFrom = null; el.fly.style.transform = ""; el.scrim.style.opacity = "0.34";
      ui.fade(root, 0, 1);
      focusHeading(el.front);
      return Promise.resolve();
    }
    flyFrom = measure(run.from);
    fly.jump(1);
    return fly.to(0).then(function () { if (run) focusHeading(el.front); });
  }

  function exit() {
    if (!run) return Promise.resolve();
    var r = run;
    setActions([]);
    var done;
    if (SB.reducedMotion()) {
      done = ui.fade(root, 1, 0);
    } else {
      flyFrom = measure(r.from);
      fly.jump(0);
      done = fly.to(1);
    }
    return done.then(function () {
      root.hidden = true;
      root.style.opacity = "";
      if (r.from) r.from.style.visibility = "";
      r.release();
      run = null;
      if (r.onExit) r.onExit(r.from);
    });
  }

  root.addEventListener("keydown", function (e) {
    if (!run || run.answered) return;
    var k = "123".indexOf(e.key);
    if (k < 0) k = "abc".indexOf(e.key.toLowerCase());
    if (k >= 0 && k < run.list[run.i].options.length && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); choose(k); }
  });

  SB.review = { open: open, exit: exit, isOpen: function () { return !!run; }, current: function () { return run; } };
})();
