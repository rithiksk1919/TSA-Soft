/* SkillBridge drawer contents, rendered into the shared panel (panel.js).
   Each entry: render(body, api, opts). Every view reads SB.store, the single source of truth,
   and re-renders its counts when the store changes. */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, store = SB.store, L = window.SBLogic;
  var $ = ui.$, $$ = ui.$$, esc = ui.esc;

  var contents = SB.drawerContents = SB.drawerContents || {};

  // Subscribe while a view is mounted; the subscription ends when the panel body is emptied.
  function live(body, fn) {
    var token = {};
    body._mount = token;
    var off = store.on(function () {
      if (body._mount !== token || !body.firstChild) { off(); return; }
      fn();
    });
  }
  SB.drawerLive = live;

  /* =====================================================================
     Flashcards (the 2D view, used in sheets; the desktop drawer uses the 3D fan)
     ===================================================================== */

  contents.flashcards = {
    render: function (body, api, opts) {
      var subject = (opts && opts.subject) || null;
      var only = (opts && opts.mistake) || null;

      function cardHTML(m) {
        var c = store.counts({ mistake: m.id });
        var s = store.subject(m.subject);
        return '<article class="icard pop" style="--sub:' + s.accent + '" data-mistake="' + m.id + '">' +
          '<p class="icard__top"><span class="icard__call">' + esc(m.call) + "</span><span>" + ui.plural(m.cards.length, "card") + "</span></p>" +
          '<h3 class="icard__title">' + esc(m.title) + "</h3>" +
          '<p class="icard__meta">' + esc(m.skill) + " · " + c[1] + " to review, " + c[2] + " learning, " + c[3] + " learned</p>" +
          '<button class="ibtn" type="button" data-review="' + m.id + '">Review ' + ui.plural(m.cards.length, "card") + "</button>" +
          "</article>";
      }

      function draw(animate) {
        var counts = store.counts(subject ? { subject: subject } : {});
        var html = '<div class="pop panel-tools">' + ui.chips(store.subjects(), subject) + ui.trays(counts) +
          '<button class="ibtn ibtn--primary" type="button" data-review-all>Review ' + (subject ? "All " + store.subject(subject).name : "All Mistakes") + " (" + counts.total + ")</button></div>";
        store.subjects().forEach(function (s) {
          if (subject && s.id !== subject) return;
          var ms = store.mistakes(s.id).filter(function (m) { return !only || m.id === only; });
          if (!ms.length) return;
          html += ui.divider(s, ui.plural(ms.length, "mistake"));
          html += '<div class="icards">' + ms.map(cardHTML).join("") + "</div>";
        });
        body.innerHTML = html;
        $$(".chip-btn", body).forEach(function (b) {
          b.addEventListener("click", function () { subject = b.dataset.subject || null; only = null; draw(true); var p = $('.chip-btn[aria-pressed="true"]', body); if (p) p.focus(); });
        });
        $$("[data-review]", body).forEach(function (b) {
          b.addEventListener("click", function () {
            var m = store.mistake(b.dataset.review);
            SB.reviewCards(store.cards({ mistake: m.id }), m.title, b);
          });
        });
        var all = $("[data-review-all]", body);
        all.addEventListener("click", function () {
          SB.reviewCards(store.cards(subject ? { subject: subject } : {}), subject ? "All " + store.subject(subject).name + " mistakes" : "All mistakes", all);
        });
        if (animate) api.pop(body);
        else $$(".pop", body).forEach(function (n) { n.style.opacity = ""; n.style.transform = ""; });
      }
      draw(false);
      live(body, function () {
        var f = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.review : null;
        draw(false);
        if (f) { var b = $('[data-review="' + f + '"]', body); if (b) b.focus({ preventScroll: true }); }
      });
    }
  };

  /* =====================================================================
     Shared view helpers
     ===================================================================== */

  // Swap the panel body to a new view: render, bind, pop the new items in, set what Esc does.
  function show(body, api, html, bind, opts) {
    opts = opts || {};
    body.innerHTML = html;
    if (bind) bind();
    api.setBack(opts.back || null);
    if (opts.scroll !== false) api.scrollTop();
    if (opts.animate !== false) api.pop(body, 28);
    var f = opts.focus ? $(opts.focus, body) : null;
    if (f) f.focus({ preventScroll: true });
  }
  function backLink(label) {
    return '<button class="back-link pop" type="button" data-back><span aria-hidden="true">←</span> ' + esc(label) + "</button>";
  }
  function bindBack(body, fn) { var b = $("[data-back]", body); if (b) b.addEventListener("click", fn); }
  function seg(name, options, current) {
    return '<div class="seg-mini" role="group" aria-label="' + esc(name) + '">' + options.map(function (o) {
      return '<button class="seg-mini__btn" type="button" data-value="' + esc(o.value) + '" aria-pressed="' + (o.value === current) + '">' + esc(o.label) + "</button>";
    }).join("") + "</div>";
  }
  function bindChips(body, sel, fn) {
    $$(sel + " .chip-btn", body).forEach(function (b) { b.addEventListener("click", function () { fn(b.dataset.subject || null, b); }); });
  }
  function bindSeg(body, fn) {
    $$(".seg-mini__btn", body).forEach(function (b) { b.addEventListener("click", function () { fn(b.dataset.value, b); }); });
  }
  function letter(k) { return String.fromCharCode(65 + k); }
  function optionsHTML(options, name) {
    return '<div class="ropts" role="group" aria-label="' + esc(name || "Answer choices") + '">' + options.map(function (o, k) {
      return '<button class="ropt" type="button" data-k="' + k + '"><span class="ropt__key">' + letter(k) + "</span><span>" + esc(o) + "</span></button>";
    }).join("") + "</div>";
  }
  function levelBar(label, value, extra) {
    return '<div class="lrow"><div class="lrow__line"><span class="lrow__name">' + esc(label) + '</span><span class="lrow__value">' + ui.num.format(value) + "</span></div>" +
      '<span class="lbar" aria-hidden="true"><span style="width:' + (value * 100).toFixed(1) + '%"></span></span>' +
      '<div class="lrow__meta"><span>' + esc(L.levelLabel({ mastery: value })) + "</span>" + (extra ? "<span>" + extra + "</span>" : "") + "</div></div>";
  }
  var dateFmt = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });
  var monthFmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" });
  function parseDate(iso) { var p = iso.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }

  /* =====================================================================
     Drawer 2: Mistakes index
     ===================================================================== */

  contents.index = {
    render: function (body, api) {
      var subject = null, sort = "frequent";

      function list(focusId) {
        var html = '<div class="pop panel-tools">' + ui.chips(store.subjects(), subject) +
          seg("Sort mistakes", [{ value: "frequent", label: "Most frequent" }, { value: "recent", label: "Most recent" }], sort) + "</div>";
        store.subjects().forEach(function (s) {
          if (subject && s.id !== subject) return;
          var ms = L.sortMistakes(store.mistakeInfos(s.id), sort);
          var max = Math.max.apply(null, ms.map(function (m) { return m.timesMade; }));
          html += ui.divider(s, ui.plural(ms.length, "mistake")) + '<div class="icards">' + ms.map(function (m) {
            var share = L.frequencyShare(m.timesMade, max);
            return '<button class="icard pop" type="button" style="--sub:' + s.accent + '" data-id="' + m.id + '">' +
              '<span class="icard__top"><span class="icard__call">' + esc(m.callNumber) + "</span><span>" + esc(m.skill) + "</span></span>" +
              '<span class="icard__title">' + esc(m.title) + "</span>" +
              '<span class="icard__meta">Made ' + ui.plural(m.timesMade, "time") + " · last seen " + esc(L.relativeDays(m.lastSeenDays)) + "</span>" +
              '<span class="fbar" aria-hidden="true"><span style="width:' + (share * 100).toFixed(0) + '%"></span></span>' +
              "</button>";
          }).join("") + "</div>";
        });
        show(body, api, html, function () {
          bindChips(body, ".panel-tools", function (id) { subject = id; list(); var p = $('.chip-btn[aria-pressed="true"]', body); if (p) p.focus(); });
          bindSeg(body, function (v) { sort = v; list(); var p = $('.seg-mini__btn[aria-pressed="true"]', body); if (p) p.focus(); });
          $$(".icard", body).forEach(function (b) { b.addEventListener("click", function () { detail(b.dataset.id); }); });
        }, { focus: focusId ? '.icard[data-id="' + focusId + '"]' : null });
      }

      function detail(id) {
        var m = store.mistakeInfo(id), s = m.subjectObj;
        var c = store.counts({ mistake: id });
        var html = backLink("All mistakes") +
          '<article class="detail pop" style="--sub:' + s.accent + '">' +
          '<p class="detail__call">' + esc(m.callNumber) + " · " + esc(s.name) + " · " + esc(m.skill) + "</p>" +
          '<h3 class="detail__title" tabindex="-1">' + esc(m.title) + "</h3>" +
          '<p class="detail__meta">Made ' + ui.plural(m.timesMade, "time") + " · last seen " + esc(L.relativeDays(m.lastSeenDays)) + "</p>" +
          '<p class="detail__text">' + esc(m.explanation) + "</p>" +
          '<div class="ex-pair">' +
          '<div class="ex ex--wrong"><p class="ex__label"><span aria-hidden="true">✕</span> Wrong</p><p class="ex__body">' + esc(m.wrongExample) + "</p></div>" +
          '<div class="ex ex--right"><p class="ex__label"><span aria-hidden="true">✓</span> Right</p><p class="ex__body">' + esc(m.rightExample) + "</p></div>" +
          "</div>" +
          '<div class="detail__actions">' +
          '<button class="ibtn ibtn--primary" type="button" data-review>Review These Cards (' + c.total + ")</button>" +
          '<button class="ibtn" type="button" data-book>Open the ' + esc(s.name) + " Book</button>" +
          "</div></article>";
        show(body, api, html, function () {
          bindBack(body, function () { list(id); });
          $("[data-review]", body).addEventListener("click", function () { SB.openDrawer("flashcards", { mistake: id }); });
          $("[data-book]", body).addEventListener("click", function () { SB.closeDrawer().then(function () { SB.openBook(m.subject); }); });
        }, { back: function () { list(id); }, focus: ".detail__title" });
      }

      list();
    }
  };

  /* =====================================================================
     Drawer 3: Worked examples
     ===================================================================== */

  contents.worked = {
    render: function (body, api) {
      var subject = null;

      function list(focusId) {
        var html = '<div class="pop panel-tools">' + ui.chips(store.subjects(), subject) + "</div>";
        store.subjects().forEach(function (s) {
          if (subject && s.id !== subject) return;
          var exs = store.examples().filter(function (e) { return store.mistake(e.mistake).subject === s.id; });
          html += ui.divider(s, ui.plural(exs.length, "example")) + '<div class="icards">' + exs.map(function (e) {
            return '<button class="icard pop" type="button" style="--sub:' + s.accent + '" data-id="' + e.id + '">' +
              '<span class="icard__top"><span class="icard__call">' + esc(e.call) + "</span><span>" + ui.plural(e.steps.length, "step") + "</span></span>" +
              '<span class="icard__title">' + esc(e.title) + "</span>" +
              '<span class="icard__meta">' + esc(store.mistake(e.mistake).title) + "</span></button>";
          }).join("") + "</div>";
        });
        show(body, api, html, function () {
          bindChips(body, ".panel-tools", function (id) { subject = id; list(); var p = $('.chip-btn[aria-pressed="true"]', body); if (p) p.focus(); });
          $$(".icard", body).forEach(function (b) { b.addEventListener("click", function () { stepper(b.dataset.id); }); });
        }, { focus: focusId ? '.icard[data-id="' + focusId + '"]' : null });
      }

      function stepHTML(e, i) {
        var st = e.steps[i];
        return '<li class="step pop' + (st.mistake ? " is-mistake" : "") + '" data-step="' + i + '">' +
          '<p class="step__n">Step ' + (i + 1) + " of " + e.steps.length + (st.mistake ? '<span class="step__flag">Common mistake here</span>' : "") + "</p>" +
          '<p class="step__text">' + esc(st.text) + "</p>" +
          '<p class="step__explain">' + esc(st.explain) + "</p>" +
          (st.mistake ? '<p class="step__watch"><b>Watch for:</b> ' + esc(st.watch) + "</p>" : "") + "</li>";
      }

      function stepper(id) {
        var e = store.example(id), m = store.mistake(e.mistake), s = store.subject(m.subject);
        var shown = 1;
        var html = backLink("All examples") +
          '<article class="detail pop" style="--sub:' + s.accent + '">' +
          '<p class="detail__call">' + esc(e.call) + " · " + esc(s.name) + " · " + esc(m.skill) + "</p>" +
          '<h3 class="detail__title" tabindex="-1">' + esc(e.title) + "</h3>" +
          '<p class="problem"><span class="problem__label">Problem</span> ' + esc(e.problem) + "</p>" +
          '<ol class="steps" aria-live="polite">' + stepHTML(e, 0) + "</ol>" +
          '<div class="stepper__bar"><span class="stepper__count" data-count>1 of ' + e.steps.length + ' steps shown</span>' +
          '<button class="ibtn ibtn--primary" type="button" data-next>Next Step <span aria-hidden="true">→</span></button></div>' +
          '<div class="check" data-check hidden></div></article>';
        function next() {
          if (shown >= e.steps.length) return;
          var ol = $(".steps", body);
          ol.insertAdjacentHTML("beforeend", stepHTML(e, shown));
          shown++;
          var li = ol.lastElementChild;
          api.pop(li);
          $("[data-count]", body).textContent = shown + " of " + e.steps.length + " steps shown";
          if (shown >= e.steps.length) { $("[data-next]", body).remove(); showCheck(); }
          li.scrollIntoView({ block: "nearest", behavior: SB.reducedMotion() ? "auto" : "smooth" });
        }
        function showCheck() {
          var box = $("[data-check]", body);
          box.hidden = false;
          box.innerHTML = '<h4 class="check__title">Check yourself</h4><p class="check__q">' + esc(e.check.question) + "</p>" + optionsHTML(e.check.options) + '<p class="check__result" data-result aria-live="polite"></p>';
          box.classList.add("pop");
          api.pop(box, 0, true);   // only the new box: popping .detail reset every step already shown
          $$(".ropt", box).forEach(function (b) {
            b.addEventListener("click", function () {
              var k = +b.dataset.k, ok = k === e.check.answer;
              $$(".ropt", box).forEach(function (o) {
                o.disabled = true;
                if (+o.dataset.k === e.check.answer) o.classList.add("is-right");
                if (o === b && !ok) o.classList.add("is-wrong");
              });
              var r = $("[data-result]", box);
              r.className = "check__result rresult " + (ok ? "rresult--ok" : "rresult--no");
              r.innerHTML = '<span class="rresult__mark" aria-hidden="true">' + (ok ? "✓" : "✕") + "</span> " + (ok ? "Correct" : "Not quite") + '. <span class="check__explain">' + esc(e.check.explain) + "</span>";
            });
          });
        }
        show(body, api, html, function () {
          bindBack(body, function () { list(id); });
          $("[data-next]", body).addEventListener("click", next);
          body.onkeydown = function (ev) {
            if (ev.key === "ArrowRight" && $("[data-next]", body) && !ev.target.closest(".ropts")) { ev.preventDefault(); next(); }
          };
        }, { back: function () { body.onkeydown = null; list(id); }, focus: ".detail__title" });
      }

      list();
    }
  };

  /* =====================================================================
     Drawer 4: Diagnostic
     ===================================================================== */

  contents.diagnostic = {
    render: function (body, api) {

      function start(focusSubject) {
        var html = '<p class="pop lede">Five multiple-choice questions per subject, one subject at a time. No hints, and you see the results at the end.</p>' +
          '<div class="dg-subjects pop">' + store.subjects().map(function (s) {
            var r = store.diagnostic.results[s.id];
            return '<button class="icard dg-subject" type="button" style="--sub:' + s.accent + '" data-subject="' + s.id + '">' +
              '<span class="icard__top"><span class="icard__call">' + esc(s.name.toUpperCase().slice(0, 3)) + ".DG</span><span>5 questions</span></span>" +
              '<span class="icard__title">' + esc(s.name) + "</span>" +
              '<span class="icard__meta">' + (r ? "Last taken " + esc(dateFmt.format(parseDate(r.date))) : "Not taken yet") + "</span></button>";
          }).join("") + "</div>";
        show(body, api, html, function () {
          $$(".dg-subject", body).forEach(function (b) { b.addEventListener("click", function () { run(b.dataset.subject); }); });
        }, { focus: focusSubject ? '.dg-subject[data-subject="' + focusSubject + '"]' : null });
      }

      function run(subjectId) {
        var qs = store.questions(subjectId), s = store.subject(subjectId), answers = [], i = 0;
        function ask() {
          var q = qs[i];
          var html = backLink("Choose a subject") +
            '<article class="detail pop" style="--sub:' + s.accent + '">' +
            '<p class="detail__call">' + esc(s.name) + " diagnostic</p>" +
            '<p class="dg-progress" aria-live="polite">Question ' + (i + 1) + " of " + qs.length + "</p>" +
            '<span class="lbar dg-bar" aria-hidden="true"><span style="width:' + ((i / qs.length) * 100).toFixed(0) + '%"></span></span>' +
            '<h3 class="detail__title dg-q" tabindex="-1">' + esc(q.prompt) + "</h3>" + optionsHTML(q.options) + "</article>";
          show(body, api, html, function () {
            bindBack(body, function () { start(subjectId); });
            $$(".ropt", body).forEach(function (b) {
              b.addEventListener("click", function () {
                var k = +b.dataset.k;
                // Verified now, shown only at the end.
                answers.push({ id: q.id, skill: q.skill, difficulty: q.difficulty, correct: k === q.answer, chosen: k });
                i++;
                if (i < qs.length) ask(); else results(subjectId, store.saveDiagnostic(subjectId, answers));
              });
            });
          }, { back: function () { start(subjectId); }, focus: ".dg-q" });
        }
        ask();
      }

      function results(subjectId, r) {
        var s = store.subject(subjectId);
        var skills = Object.keys(r.mastery);
        var weakest = L.weakestSkill(r.mastery);
        var right = r.answers.filter(function (a) { return a.correct; }).length;
        var html = backLink("Choose a subject") +
          '<article class="detail pop" style="--sub:' + s.accent + '">' +
          '<p class="detail__call">' + esc(s.name) + " diagnostic · " + esc(dateFmt.format(parseDate(r.date))) + "</p>" +
          '<h3 class="detail__title" tabindex="-1">' + right + " of " + r.answers.length + " correct</h3>" +
          '<div class="lrows">' + skills.map(function (k) {
            var x = r.mastery[k];
            return levelBar(k, x.mastery, x.correct + " of " + ui.plural(x.questions, "question") + (k === weakest ? " · weakest" : ""));
          }).join("") + "</div>" +
          '<p class="callout"><b>Weakest skill:</b> ' + esc(weakest) + " (" + ui.num.format(r.mastery[weakest].mastery) + "). Start there.</p>" +
          '<p class="detail__meta">Starting mastery is set from these results. Saved on this device.</p>' +
          '<div class="detail__actions"><button class="ibtn ibtn--primary" type="button" data-retake>Retake ' + esc(s.name) + "</button></div></article>";
        show(body, api, html, function () {
          bindBack(body, function () { start(subjectId); });
          $("[data-retake]", body).addEventListener("click", function () { run(subjectId); });
        }, { back: function () { start(subjectId); }, focus: ".detail__title" });
        ui.announce("Diagnostic done: " + right + " of " + r.answers.length + " correct. Weakest skill " + weakest + ".");
      }

      start();
    }
  };

  /* =====================================================================
     Drawer 5: History
     ===================================================================== */

  contents.history = {
    render: function (body, api) {
      var subject = null, result = "all";

      function filtered() {
        return store.attempts().filter(function (a) {
          return (!subject || a.subject === subject) && (result === "all" || (result === "solved") === a.solved);
        });
      }

      function list(focusId) {
        var rows = filtered();
        var sum = L.historySummary(rows);
        var html = '<div class="pop panel-tools">' + ui.chips(store.subjects(), subject) +
          seg("Filter by result", [{ value: "all", label: "All results" }, { value: "solved", label: "Solved" }, { value: "unsolved", label: "Not solved" }], result) + "</div>" +
          '<dl class="stats pop" aria-label="Summary">' +
          '<div><dt>Attempts</dt><dd>' + sum.attempts + "</dd></div>" +
          "<div><dt>Solved</dt><dd>" + sum.solvedPct + "%</dd></div>" +
          "<div><dt>Average hints</dt><dd>" + sum.avgHints.toFixed(2) + "</dd></div>" +
          "<div><dt>Solved with no hints</dt><dd>" + sum.solvedNoHints + "</dd></div></dl>";
        if (!rows.length) html += '<p class="empty pop">No attempts match these filters.</p>';
        var month = null;
        rows.forEach(function (a) {
          var mk = monthFmt.format(parseDate(a.date));
          if (mk !== month) {
            if (month) html += "</div>";
            month = mk;
            var inMonth = rows.filter(function (x) { return monthFmt.format(parseDate(x.date)) === mk; }).length;
            html += '<div class="divider-row divider-row--month pop"><span class="divider-row__tab">' + esc(mk) + '</span><span class="divider-row__meta">' + ui.plural(inMonth, "attempt") + "</span></div><div class=\"icards\">";
          }
          html += '<button class="icard pop" type="button" style="--sub:' + a.subjectObj.accent + '" data-id="' + a.id + '">' +
            '<span class="icard__top"><span class="icard__call">' + esc(a.call) + "</span><span>" + esc(dateFmt.format(parseDate(a.date))) + "</span></span>" +
            '<span class="icard__title">' + esc(a.title) + "</span>" +
            '<span class="icard__meta">' + esc(a.subjectObj.name) + " · " + esc(a.skill) + "</span>" +
            '<span class="hrow"><span class="hres ' + (a.solved ? "hres--ok" : "hres--no") + '"><span aria-hidden="true">' + (a.solved ? "✓" : "✕") + "</span> " + (a.solved ? "Solved" : "Not solved") + "</span>" +
            '<span class="hnums">' + ui.plural(a.attempts, "attempt") + " · " + ui.plural(a.hints, "hint") + '</span><span class="hscore">o = ' + ui.num.format(a.score) + "</span></span></button>";
        });
        if (month) html += "</div>";
        show(body, api, html, function () {
          bindChips(body, ".panel-tools", function (id) { subject = id; list(); var p = $('.chip-btn[aria-pressed="true"]', body); if (p) p.focus(); });
          bindSeg(body, function (v) { result = v; list(); var p = $('.seg-mini__btn[aria-pressed="true"]', body); if (p) p.focus(); });
          $$(".icard", body).forEach(function (b) { b.addEventListener("click", function () { detail(b.dataset.id); }); });
        }, { focus: focusId ? '.icard[data-id="' + focusId + '"]' : null });
      }

      function detail(id) {
        var a = store.attempts().filter(function (x) { return x.id === id; })[0];
        var html = backLink("All attempts") +
          '<article class="detail pop" style="--sub:' + a.subjectObj.accent + '">' +
          '<p class="detail__call">' + esc(a.call) + " · " + esc(a.subjectObj.name) + " · " + esc(dateFmt.format(parseDate(a.date))) + "</p>" +
          '<h3 class="detail__title" tabindex="-1">' + esc(a.title) + "</h3>" +
          '<p class="detail__meta">' + esc(a.skill) + " · " + (a.solved ? "Solved" : "Not solved") + " · " + ui.plural(a.attempts, "attempt") + " · " + ui.plural(a.hints, "hint") + " · outcome o = " + ui.num.format(a.score) + "</p>" +
          '<h4 class="check__title">Recorded actions</h4>' +
          '<ol class="timeline">' + a.actions.map(function (x) {
            return '<li class="timeline__row timeline__row--' + x[1] + '"><span class="timeline__t">' + esc(x[0]) + '</span><span class="timeline__k">' + esc(x[1]) + '</span><span class="timeline__n">' + esc(x[2]) + "</span></li>";
          }).join("") + "</ol></article>";
        show(body, api, html, function () { bindBack(body, function () { list(id); }); }, { back: function () { list(id); }, focus: ".detail__title" });
      }

      list();
    }
  };

  /* =====================================================================
     Drawer 6: Learned (reads the Flashcards boxes from the store, not a copy)
     ===================================================================== */

  // The ink stamp presses in once, the first time it is seen (pop spring; none with reduced motion).
  function pressStamps(body) {
    $$(".stamp", body).forEach(function (st) {
      var key = st.dataset.stamp;
      if (store.stampSeen(key) || SB.reducedMotion()) { store.markStamp(key); return; }
      store.markStamp(key);
      st.style.opacity = "0";
      SB.spring(0, 1, SB.PRESETS.pop, function (t) {
        st.style.transform = "rotate(-4deg) scale(" + (1.6 - 0.6 * t).toFixed(3) + ")";
        st.style.opacity = ui.clamp(t * 1.4, 0, 1).toFixed(3);
      });
    });
  }

  contents.learned = {
    render: function (body, api) {

      function list(focusId) {
        var learned = store.cards({ box: L.LEARNED });
        var skills = store.masteredSkills();
        var html = '<section class="pop mastered" aria-labelledby="mastered-h"><h3 class="check__title" id="mastered-h">Mastered skills</h3><div class="mastered__row">' +
          skills.map(function (k) {
            return '<div class="mskill" style="--sub:' + k.subject.accent + '"><p class="mskill__name">' + esc(k.name) + '</p><p class="mskill__meta">' + esc(k.subject.name) + " · " + ui.num.format(k.mastery) + "</p>" +
              '<span class="stamp" data-stamp="' + esc(k.subject.id + ":" + k.name) + '">Verified · transfer passed</span></div>';
          }).join("") + "</div></section>";
        if (!learned.length) {
          html += '<p class="empty pop">No cards learned yet. Answer a card correctly twice to move it here.</p>';
        } else {
          store.subjects().forEach(function (s) {
            var cs = learned.filter(function (c) { return c.subject.id === s.id; });
            if (!cs.length) return;
            html += ui.divider(s, ui.plural(cs.length, "card")) + '<div class="icards">' + cs.map(function (c) {
              return '<button class="icard pop" type="button" style="--sub:' + s.accent + '" data-id="' + c.id + '">' +
                '<span class="icard__top"><span class="icard__call">' + esc(c.mistake.call) + "</span><span>Learned</span></span>" +
                '<span class="icard__title">' + esc(c.prompt) + "</span>" +
                '<span class="icard__meta">' + esc(c.mistake.title) + "</span></button>";
            }).join("") + "</div>";
          });
        }
        show(body, api, html, function () {
          $$(".icard", body).forEach(function (b) { b.addEventListener("click", function () { detail(b.dataset.id); }); });
        }, { focus: focusId ? '.icard[data-id="' + focusId + '"]' : null });
        pressStamps(body);
      }

      function detail(id) {
        var c = store.cards().filter(function (x) { return x.id === id; })[0];
        var html = backLink("All learned cards") +
          '<article class="detail pop" style="--sub:' + c.subject.accent + '">' +
          '<p class="detail__call">' + esc(c.mistake.call) + " · " + esc(c.subject.name) + " · Learned</p>" +
          '<h3 class="detail__title" tabindex="-1">' + esc(c.prompt) + "</h3>" +
          '<p class="answer"><span class="problem__label">Answer</span> ' + letter(c.answer) + ". " + esc(c.options[c.answer]) + "</p>" +
          '<p class="detail__text">' + esc(c.explain) + "</p>" +
          '<div class="detail__actions"><button class="ibtn" type="button" data-move>Move Back to Learning</button></div></article>';
        show(body, api, html, function () {
          bindBack(body, function () { list(); });
          $("[data-move]", body).addEventListener("click", function () {
            store.setBox(id, 2);
            ui.announce("Moved back to Learning.");
            list();
            var first = $(".icard, .empty", body);
            if (first && first.focus) first.focus({ preventScroll: true });
          });
        }, { back: function () { list(id); }, focus: ".detail__title" });
      }

      list();
    }
  };
})();
