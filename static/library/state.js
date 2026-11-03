/* SkillBridge shared state: one source of truth for cards, boxes and everything the drawers show.
   Review state persists in localStorage "sb_cards" (with a graceful in-memory fallback). */
(function () {
  "use strict";
  var SB = window.SkillBridge = window.SkillBridge || {};
  var L = window.SBLogic;

  var KEY = "sb_cards";
  var listeners = [];
  var persistOK = true;

  function read(key) {
    try { var raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { persistOK = false; return null; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { persistOK = false; return false; }
  }
  function getJSON(path) {
    return fetch(path).then(function (r) { if (!r.ok) throw new Error(path + " " + r.status); return r.json(); });
  }

  var store = {
    data: {},
    // boxes: card id -> box (1..3). Missing means box 1.
    review: { v: 1, boxes: {}, answers: 0 },
    persistent: function () { return persistOK; }
  };

  store.on = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; };
  function emit(what) { listeners.forEach(function (fn) { try { fn(what); } catch (e) { setTimeout(function () { throw e; }); } }); }
  store.emit = emit;

  /* ---------- Cards and boxes ---------- */

  store.subjects = function () { return store.data.cards ? store.data.cards.subjects : []; };
  store.subject = function (id) { return store.subjects().filter(function (s) { return s.id === id; })[0]; };
  store.mistakes = function (subjectId) {
    var all = store.data.cards ? store.data.cards.mistakes : [];
    return subjectId ? all.filter(function (m) { return m.subject === subjectId; }) : all;
  };
  store.mistake = function (id) { return store.mistakes().filter(function (m) { return m.id === id; })[0]; };
  // Flat list of cards, each with its mistake and subject attached.
  store.cards = function (filter) {
    filter = filter || {};
    var out = [];
    store.mistakes(filter.subject).forEach(function (m) {
      if (filter.mistake && m.id !== filter.mistake) return;
      m.cards.forEach(function (c) {
        var card = Object.assign({}, c, { mistake: m, subject: store.subject(m.subject) });
        if (filter.box && store.box(c.id) !== filter.box) return;
        out.push(card);
      });
    });
    return out;
  };
  store.box = function (cardId) { return store.review.boxes[cardId] || 1; };
  store.counts = function (filter) {
    return L.leitnerCounts(store.cards(filter).map(function (c) { return c.id; }), store.review.boxes);
  };

  // Record an answer: move the card by the Leitner rule. Returns { from, to }.
  store.answer = function (cardId, correct) {
    var from = store.box(cardId), to = L.nextBox(from, correct);
    store.review.boxes[cardId] = to;
    store.review.answers++;
    write(KEY, store.review);
    emit("cards");
    return { from: from, to: to };
  };
  // Move a card to a box directly (Learned -> "Move back to Learning").
  store.setBox = function (cardId, box) {
    store.review.boxes[cardId] = L.clamp(box, 1, L.LEARNED);
    write(KEY, store.review);
    emit("cards");
  };
  store.resetReview = function () {
    store.review = { v: 1, boxes: {}, answers: 0 };
    write(KEY, store.review);
    emit("cards");
  };

  /* ---------- Live counts for the cabinet label cards ---------- */

  function plural(n, one) { return n + " " + (n === 1 ? one : one + "s"); }
  store.countLabel = function (kind) {
    var d = store.data;
    switch (kind) {
      case "cards": return plural(store.cards().length, "card");
      case "mistakes": return plural(store.mistakes().length, "mistake");
      case "examples": return d.worked ? plural(d.worked.examples.length, "example") : "";
      case "questions": return d.diagnostic ? plural(d.diagnostic.questions.length, "question") : "";
      case "attempts": return d.history ? plural(d.history.attempts.length, "attempt") : "";
      case "learned": return plural(store.counts()[L.LEARNED], "card");
      default: return "";
    }
  };

  /* ---------- Boot ---------- */

  var saved = read(KEY);
  if (saved && saved.v === 1 && saved.boxes && typeof saved.boxes === "object") store.review = saved;

  store.ready = Promise.all([getJSON("data/cards.json"), getJSON("data/drawers.json")]).then(function (r) {
    store.data.cards = r[0];
    store.data.drawers = r[1].drawers;
    // Drop saved boxes for cards that no longer exist.
    var ids = store.cards().map(function (c) { return c.id; });
    Object.keys(store.review.boxes).forEach(function (id) { if (ids.indexOf(id) < 0) delete store.review.boxes[id]; });
    return store;
  });

  // Other tabs (or a test) changing the same storage key: follow it.
  window.addEventListener("storage", function (e) {
    if (e.key !== KEY) return;
    var next = read(KEY);
    if (next && next.v === 1) { store.review = next; emit("cards"); }
  });

  SB.store = store;
})();
