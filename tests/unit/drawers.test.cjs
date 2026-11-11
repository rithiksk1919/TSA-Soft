// Unit tests for the drawer logic: outcomeScore, diagnosticMastery, sorting, summaries.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../static/library/logic.js");
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("outcomeScore: unsolved is 0 whatever the attempts and hints", () => {
  assert.equal(L.outcomeScore(false, 1, 0), 0);
  assert.equal(L.outcomeScore(false, 5, 3), 0);
});
test("outcomeScore: first try, no hints is 1", () => assert.equal(L.outcomeScore(true, 1, 0), 1));
test("outcomeScore: 0.2 per extra attempt, 0.15 per hint", () => {
  close(L.outcomeScore(true, 2, 0), 0.8);
  close(L.outcomeScore(true, 1, 1), 0.85);
  close(L.outcomeScore(true, 2, 1), 0.65);
  close(L.outcomeScore(true, 3, 1), 0.45);
});
test("outcomeScore: the 0.4 floor", () => {
  close(L.outcomeScore(true, 3, 2), 0.4);    // 1 - 0.4 - 0.3 = 0.30 -> 0.4
  close(L.outcomeScore(true, 4, 3), 0.4);    // negative -> 0.4
  close(L.outcomeScore(true, 4, 0), 0.4);    // exactly 0.4
});
test("outcomeScore: bad input is normalised (attempts >= 1, hints >= 0)", () => {
  assert.equal(L.outcomeScore(true, 0, -2), 1);
});

test("diagnosticMastery: all correct gives 1.0 on every skill", () => {
  const r = L.diagnosticMastery([
    { skill: "A", difficulty: 0.3, correct: true }, { skill: "A", difficulty: 0.7, correct: true }, { skill: "B", difficulty: 0.5, correct: true }
  ]);
  close(r.A.mastery, 1); close(r.B.mastery, 1);
});
test("diagnosticMastery: all wrong gives the 0.3 floor", () => {
  const r = L.diagnosticMastery([{ skill: "A", difficulty: 0.3, correct: false }, { skill: "A", difficulty: 0.9, correct: false }]);
  close(r.A.mastery, 0.3);
  close(r.A.weightedCorrect, 0);
});
test("diagnosticMastery: mixed answers are weighted by difficulty", () => {
  // Skill A: easy (0.3) right, hard (0.7) wrong -> weighted 0.3 -> 0.3 + 0.21 = 0.51
  // Skill B: easy (0.2) wrong, hard (0.8) right -> weighted 0.8 -> 0.3 + 0.56 = 0.86
  const r = L.diagnosticMastery([
    { skill: "A", difficulty: 0.3, correct: true }, { skill: "A", difficulty: 0.7, correct: false },
    { skill: "B", difficulty: 0.2, correct: false }, { skill: "B", difficulty: 0.8, correct: true }
  ]);
  close(r.A.mastery, 0.51); close(r.B.mastery, 0.86);
  assert.equal(r.A.questions, 2); assert.equal(r.A.correct, 1);
  assert.equal(L.weakestSkill(r), "A");
});
test("diagnosticMastery: zero difficulty falls back to the plain share", () => {
  const r = L.diagnosticMastery([{ skill: "A", difficulty: 0, correct: true }, { skill: "A", difficulty: 0, correct: false }]);
  close(r.A.mastery, 0.65);
});
test("diagnosticMastery: empty input gives no skills", () => {
  assert.deepEqual(L.diagnosticMastery([]), {});
  assert.equal(L.weakestSkill({}), null);
});

test("sortMistakes: most frequent, ties broken by most recent", () => {
  const list = [{ id: "a", timesMade: 3, lastSeenDays: 6 }, { id: "b", timesMade: 5, lastSeenDays: 2 }, { id: "c", timesMade: 3, lastSeenDays: 1 }];
  assert.deepEqual(L.sortMistakes(list, "frequent").map((m) => m.id), ["b", "c", "a"]);
  assert.deepEqual(L.sortMistakes(list, "recent").map((m) => m.id), ["c", "b", "a"]);
  assert.deepEqual(list.map((m) => m.id), ["a", "b", "c"], "does not mutate");
});
test("frequencyShare and relativeDays", () => {
  close(L.frequencyShare(3, 5), 0.6);
  assert.equal(L.frequencyShare(1, 0), 0);
  assert.equal(L.relativeDays(0), "today");
  assert.equal(L.relativeDays(1), "yesterday");
  assert.equal(L.relativeDays(2), "2 days ago");
  assert.equal(L.relativeDays(9), "1 week ago");
  assert.equal(L.relativeDays(21), "3 weeks ago");
});
test("historySummary", () => {
  const s = L.historySummary([{ solved: true, hints: 0 }, { solved: true, hints: 2 }, { solved: false, hints: 1 }, { solved: true, hints: 0 }]);
  assert.deepEqual(s, { attempts: 4, solvedPct: 75, avgHints: 0.75, solvedNoHints: 2 });
  assert.deepEqual(L.historySummary([]), { attempts: 0, solvedPct: 0, avgHints: 0, solvedNoHints: 0 });
});
