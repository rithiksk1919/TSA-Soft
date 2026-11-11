/* SkillBridge drawer interiors: what each drawer holds, and the one motion that says what it is for.
   Desktop 3D only (flat mode has no drawer interiors). Every motion runs on spring.js presets.
     index       cards rise to heights set by how often each mistake was made (a bar chart in card)
     worked      step sheets riffle back like pages; the common-mistake step stands up and lifts out
     diagnostic  three columns of question tiles climb to their difficulty, question by question
     history     a thumb-through wave from newest to oldest; then the month dividers lift
     learned     the mastered-skill card rises, a brass stamp comes forward and presses the ink mark */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, L = window.SBLogic, store = SB.store;
  var esc = ui.esc, clamp = ui.clamp, lerp = ui.lerp, wait = ui.wait;

  /* ---------- A piece: one plane inside a drawer, moved between poses by its own spring ---------- */

  var BASE = { x: 0, y: 0, z: 0, rx: 0, rz: 0, s: 1, o: 1 };
  function pose(p) { return Object.assign({}, BASE, p); }

  function Piece(el, home, preset) {
    var self = this;
    this.el = el;
    this.home = pose(home);
    this.cur = this.home; this.from = this.home; this.to = this.home;
    this.sp = SB.createSpring(preset || P.pop, function (t) { self.render(t); }, 1);
    this.render(1);
  }
  Piece.prototype.render = function (t) {
    var a = this.from, b = this.to, p = {};
    for (var k in BASE) p[k] = lerp(a[k], b[k], t);
    p.o = clamp(p.o, 0, 1);
    this.cur = p;
    this.el.style.transform = "translate3d(" + p.x.toFixed(2) + "px," + p.y.toFixed(2) + "px," + p.z.toFixed(2) + "px) rotateX(" +
      p.rx.toFixed(2) + "deg) rotateZ(" + p.rz.toFixed(2) + "deg) scale(" + p.s.toFixed(4) + ")";
    this.el.style.opacity = p.o >= 0.999 ? "" : p.o.toFixed(3);
  };
  // Re-target from wherever the piece is now (never restart, never stack).
  Piece.prototype.go = function (target) {
    this.from = this.cur;
    this.to = pose(Object.assign({}, this.home, target));
    this.sp.jump(0);
    this.sp.to(1);
    return this.sp.near(0.03);
  };
  Piece.prototype.rest = function () { return this.go({}); };

  /* ---------- Shared building blocks ---------- */

  function geom(G) {
    return { cw: G.dw - 16, ch: G.dh - 24, depth: G.DD - 26 };
  }
  // n planes standing front (i = 0) to back, within the front `share` of the drawer's depth.
  function zFor(i, n, depth, share) { return -14 - i * ((depth * (share || 1)) / Math.max(1, n - 1)); }

  function place(box, cls, style, inner) {
    var el = document.createElement("span");
    el.className = "ipiece " + cls;
    el.setAttribute("style", style);
    el.innerHTML = inner || "";
    box.appendChild(el);
    return el;
  }

  // Each interior: build(box, G) -> { play(token), reset() }. A play is cancelled by the next
  // play or reset: pending staggered starts check the token before moving anything.
  function runner() {
    var seq = 0;
    return {
      start: function () { return ++seq; },
      live: function (my) { return my === seq; },
      stop: function () { seq++; }
    };
  }
  function stagger(pieces, gap, fn, my, r) {
    return Promise.all(pieces.map(function (pc, i) {
      return wait(i * gap).then(function () { if (r.live(my)) return fn(pc, i); });
    }));
  }
  function resetAll(pieces, r) {
    r.stop();
    var my = r.start();
    return stagger(pieces.slice().reverse(), 14, function (pc) { return pc.rest(); }, my, r);
  }

  var builders = {};

  /* ---------- Mistakes index: the cards are a bar chart of how often each mistake was made ---------- */

  builders.index = function (box, G) {
    var g = geom(G), r = runner();
    // Least frequent in front, most frequent at the back, so every tab stays in view as they rise.
    var ms = L.sortMistakes(store.mistakeInfos(), "frequent").reverse();
    var tabW = Math.min(64, (g.cw - 8) / ms.length + 22);
    var pieces = ms.map(function (m, i) {
      var s = store.subject(m.subject);
      var left = 4 + i * ((g.cw - tabW - 8) / Math.max(1, ms.length - 1));
      var el = place(box, "icard3", "--sub:" + s.accent + ";width:" + g.cw + "px;height:" + g.ch + "px;left:8px;top:18px",
        '<span class="icard3__tab" style="left:' + left.toFixed(1) + "px;width:" + tabW.toFixed(1) + 'px">' + m.timesMade + "×</span>" +
        '<span class="icard3__call">' + esc(m.callNumber) + "</span>");
      var pc = new Piece(el, { z: zFor(i, ms.length, g.depth, 0.85) });
      pc.times = m.timesMade;
      return pc;
    });
    var byRank = pieces.slice().sort(function (a, b) { return b.times - a.times; });
    return {
      play: function () {
        var my = r.start();
        return stagger(byRank, 70, function (pc) { return pc.go({ y: -(10 + 15 * pc.times) }); }, my, r);
      },
      reset: function () { return resetAll(pieces, r); }
    };
  };

  /* ---------- Worked examples: step sheets riffle back; the mistake step stands up ---------- */

  builders.worked = function (box, G) {
    var g = geom(G), r = runner();
    var n = 5, mistakeStep = 2;   // step 3 of 5 carries the "common mistake here" tab
    var tabW = Math.min(30, (g.cw - 8) / n);
    var pieces = [];
    for (var i = 0; i < n; i++) {
      var left = 6 + i * ((g.cw - tabW - 12) / (n - 1));
      var el = place(box, "isheet" + (i === mistakeStep ? " isheet--mistake" : ""), "width:" + g.cw + "px;height:" + g.ch + "px;left:8px;top:18px",
        '<span class="isheet__tab" style="left:' + left.toFixed(1) + "px;width:" + tabW.toFixed(1) + 'px">' + (i + 1) + "</span>" +
        '<span class="isheet__rule"></span><span class="isheet__rule"></span><span class="isheet__rule"></span>');
      // Sheets stand in the front half of the drawer, so leaning back keeps them inside it.
      pieces.push(new Piece(el, { z: zFor(i, n, g.depth, 0.42) }));
    }
    return {
      play: function () {
        var my = r.start();
        // Each sheet lifts clear of the drawer face as it turns back, like a page being read.
        return stagger(pieces, 90, function (pc) { return pc.go({ y: -30, rx: 34 }); }, my, r).then(function () {
          if (!r.live(my)) return;
          return pieces[mistakeStep].go({ rx: 0, y: -78, z: pieces[mistakeStep].home.z + 14 });
        });
      },
      reset: function () { return resetAll(pieces, r); }
    };
  };

  /* ---------- Diagnostic: three difficulty ladders climbing question by question ---------- */

  builders.diagnostic = function (box, G) {
    var g = geom(G), r = runner();
    var subjects = store.subjects();
    var colW = (g.cw - 12) / subjects.length;
    var pieces = [];
    subjects.forEach(function (s, c) {
      var qs = store.questions(s.id);
      qs.forEach(function (q, k) {
        var el = place(box, "itile", "--sub:" + s.accent + ";width:" + (colW - 4).toFixed(1) + "px;height:" + (g.ch - 10) + "px;left:" + (8 + c * (colW + 6)).toFixed(1) + "px;top:28px",
          '<span class="itile__n">Q' + (k + 1) + "</span>");
        var pc = new Piece(el, { z: zFor(k, qs.length, g.depth, 0.8) });
        pc.q = k; pc.c = c; pc.difficulty = q.difficulty;
        pieces.push(pc);
      });
    });
    var order = pieces.slice().sort(function (a, b) { return (a.q - b.q) || (a.c - b.c); });
    return {
      play: function () {
        var my = r.start();
        return Promise.all(order.map(function (pc) {
          return wait(pc.q * 85 + pc.c * 22).then(function () {
            if (r.live(my)) return pc.go({ y: -(8 + 78 * pc.difficulty) });
          });
        }));
      },
      reset: function () { return resetAll(pieces, r); }
    };
  };

  /* ---------- History: a thumb-through from newest to oldest, then the months lift ---------- */

  builders.history = function (box, G) {
    var g = geom(G), r = runner();
    var attempts = store.attempts();          // newest first
    var monthFmt = new Intl.DateTimeFormat("en", { month: "short" });
    var items = [], month = null;
    attempts.forEach(function (a) {
      var p = a.date.split("-"), mk = monthFmt.format(new Date(+p[0], +p[1] - 1, +p[2]));
      if (mk !== month) { month = mk; items.push({ divider: true, label: mk }); }
      items.push({ a: a });
    });
    var tabSpots = [0.06, 0.38, 0.7];
    var di = 0;
    var pieces = items.map(function (it, i) {
      var el;
      if (it.divider) {
        el = place(box, "idiv", "width:" + g.cw + "px;height:" + g.ch + "px;left:8px;top:18px",
          '<span class="idiv__tab" style="left:' + Math.round(tabSpots[di++ % 3] * g.cw) + 'px">' + esc(it.label) + "</span>");
      } else {
        el = place(box, "irec", "--sub:" + it.a.subjectObj.accent + ";width:" + g.cw + "px;height:" + g.ch + "px;left:8px;top:18px",
          '<span class="irec__clip irec__clip--' + (it.a.solved ? "ok" : "no") + '"></span>');
      }
      var pc = new Piece(el, { z: zFor(i, items.length, g.depth, 0.95) });
      pc.divider = !!it.divider;
      return pc;
    });
    return {
      play: function () {
        var my = r.start();
        // Each card flicks back and springs home: the next re-target keeps its velocity.
        return stagger(pieces, 38, function (pc) {
          pc.go({ rx: 34, y: -12 });
          return wait(120).then(function () { if (r.live(my)) return pc.rest(); });
        }, my, r).then(function () {
          if (!r.live(my)) return;
          return stagger(pieces.filter(function (p) { return p.divider; }), 80, function (pc) { return pc.go({ y: -40 }); }, my, r);
        });
      },
      reset: function () { return resetAll(pieces, r); }
    };
  };

  /* ---------- Learned: the mastered card rises; the stamp comes forward and presses ---------- */

  builders.learned = function (box, G) {
    var g = geom(G), r = runner();
    var skills = store.masteredSkills();
    var learnedCount = Math.min(4, store.counts()[L.LEARNED]);
    var cards = [];
    skills.forEach(function (k, i) {
      cards.push({ label: k.name, accent: k.subject.accent, mastered: true });
    });
    for (var j = 0; j < learnedCount; j++) cards.push({ label: "", accent: "#9C8A71" });
    var pieces = cards.map(function (c, i) {
      var el = place(box, "ilearn" + (c.mastered ? " ilearn--mastered" : ""), "--sub:" + c.accent + ";width:" + g.cw + "px;height:" + g.ch + "px;left:8px;top:18px",
        (c.label ? '<span class="ilearn__name">' + esc(c.label) + "</span>" : "") +
        (c.mastered ? '<span class="ilearn__ink">Verified</span>' : ""));
      return new Piece(el, { z: zFor(i, Math.max(2, cards.length), g.depth, 0.7) });
    });
    var front = pieces[0];
    var ink = front ? new Piece(front.el.querySelector(".ilearn__ink"), { o: 0, s: 1.25 }, P.flip) : null;
    // The stamp: a brass base and a dark knob, held in front of the card it will press.
    var stampEl = place(box, "istamp", "left:" + (8 + g.cw / 2 - 30) + "px;top:24px",
      '<span class="istamp__knob"></span><span class="istamp__base"></span>');
    var stamp = new Piece(stampEl, { z: 170, y: -96, o: 0, s: 1 }, P.drawer);
    return {
      play: function () {
        var my = r.start();
        if (!front) return Promise.resolve();
        var cardZ = front.home.z;
        return front.go({ y: -82, z: cardZ + 18 }).then(function () {
          if (!r.live(my)) return;
          return stamp.go({ z: 150, y: -96, o: 1 });
        }).then(function () {
          if (!r.live(my)) return;
          return stamp.go({ z: cardZ + 22, y: -96, o: 1 });                // comes forward onto the card
        }).then(function () {
          if (!r.live(my)) return;
          ink.go({ o: 1, s: 1 });                                             // the ink lands
          return stamp.go({ z: cardZ + 20, y: -96, o: 1, s: 0.94 });         // the press
        }).then(function () {
          if (!r.live(my)) return;
          return stamp.go({ z: 190, y: -150, o: 0, s: 1 });                  // lifts away
        });
      },
      reset: function () {
        var all = pieces.concat(stamp ? [stamp] : []);
        if (ink) ink.rest();
        return resetAll(all, r);
      }
    };
  };

  /* ---------- Public: build into each drawer, play on open, reset on close ---------- */

  var built = {};
  SB.interiors = {
    build: function (id, box, G) {
      if (!builders[id] || !box) return null;
      box.innerHTML = "";
      built[id] = builders[id](box, G);
      return built[id];
    },
    play: function (id) { return built[id] && !ui.flat() ? built[id].play() : Promise.resolve(); },
    reset: function (id) { return built[id] && !ui.flat() ? built[id].reset() : Promise.resolve(); },
    has: function (id) { return !!builders[id]; }
  };
})();
