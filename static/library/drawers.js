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
})();
