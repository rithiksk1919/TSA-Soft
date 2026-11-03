/* SkillBridge pure logic. No DOM. Loaded by the page (window.SBLogic) and by node --test. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SBLogic = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function round2(x) { return Math.round(x * 100) / 100; }

  /* ---------- Mastery ---------- */

  // Mean of the skills' mastery values. An empty list has no mastery: 0.
  function averageMastery(skills) {
    if (!skills || !skills.length) return 0;
    var sum = 0;
    for (var i = 0; i < skills.length; i++) sum += skills[i].mastery;
    return sum / skills.length;
  }

  // Level label for one skill. "mastered" wins over the number (it means the transfer check passed).
  function levelLabel(skill) {
    if (skill.mastered) return "Mastered · transfer check passed";
    var m = skill.mastery;
    if (m < 0.4) return "Beginning";
    if (m < 0.6) return "Developing";
    if (m < 0.8) return "Proficient";
    return "Near mastery";
  }

  /* ---------- Leitner boxes ---------- */

  // Three boxes. A correct answer moves a card up one box (Learned is the top);
  // a wrong answer sends it back to box 1. Two correct answers in a row: 1 -> 2 -> 3.
  var BOXES = [
    { id: 1, name: "To review" },
    { id: 2, name: "Learning" },
    { id: 3, name: "Learned" }
  ];
  var LEARNED = 3;

  function nextBox(box, correct) {
    var b = clamp(Math.round(box) || 1, 1, LEARNED);
    return correct ? Math.min(b + 1, LEARNED) : 1;
  }

  // Counts per box for a list of card ids, given a map id -> box (missing = box 1).
  function leitnerCounts(cardIds, boxes) {
    var out = { 1: 0, 2: 0, 3: 0, total: 0 };
    (cardIds || []).forEach(function (id) {
      var b = boxes && boxes[id] ? clamp(boxes[id], 1, LEARNED) : 1;
      out[b]++;
      out.total++;
    });
    return out;
  }

  function boxName(box) {
    var b = BOXES.filter(function (x) { return x.id === box; })[0];
    return b ? b.name : BOXES[0].name;
  }

  return {
    clamp: clamp,
    round2: round2,
    averageMastery: averageMastery,
    levelLabel: levelLabel,
    BOXES: BOXES,
    LEARNED: LEARNED,
    nextBox: nextBox,
    leitnerCounts: leitnerCounts,
    boxName: boxName
  };
});
