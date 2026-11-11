// Unit tests for static/library/logic.js. Run: node --test tests/unit/
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../static/library/logic.js");
const subjects = require("../../static/library/data/subjects.json").subjects;

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("averageMastery: mean of the skills", () => {
  close(L.averageMastery([{ mastery: 0.2 }, { mastery: 0.4 }]), 0.3);
  close(L.averageMastery([{ mastery: 1 }]), 1);
});
test("averageMastery: empty or missing list is 0", () => {
  assert.equal(L.averageMastery([]), 0);
  assert.equal(L.averageMastery(undefined), 0);
});
test("averageMastery: shelf data matches the spec's sample averages", () => {
  const avg = Object.fromEntries(subjects.map((s) => [s.id, L.round2(L.averageMastery(s.skills))]));
  assert.deepEqual(avg, { physics: 0.56, chemistry: 0.50, biology: 0.61 });
});

test("levelLabel: thresholds 0.4 / 0.6 / 0.8 are lower bounds", () => {
  assert.equal(L.levelLabel({ mastery: 0 }), "Beginning");
  assert.equal(L.levelLabel({ mastery: 0.399 }), "Beginning");
  assert.equal(L.levelLabel({ mastery: 0.4 }), "Developing");
  assert.equal(L.levelLabel({ mastery: 0.599 }), "Developing");
  assert.equal(L.levelLabel({ mastery: 0.6 }), "Proficient");
  assert.equal(L.levelLabel({ mastery: 0.799 }), "Proficient");
  assert.equal(L.levelLabel({ mastery: 0.8 }), "Near mastery");
  assert.equal(L.levelLabel({ mastery: 1 }), "Near mastery");
});
test("levelLabel: mastered flag wins over the number", () => {
  assert.equal(L.levelLabel({ mastery: 0.84, mastered: true }), "Mastered · transfer check passed");
  assert.equal(L.levelLabel({ mastery: 0.1, mastered: true }), "Mastered · transfer check passed");
});

test("nextBox: all 6 transitions of the three-box Leitner system", () => {
  assert.equal(L.nextBox(1, true), 2);
  assert.equal(L.nextBox(2, true), 3);
  assert.equal(L.nextBox(3, true), 3);
  assert.equal(L.nextBox(1, false), 1);
  assert.equal(L.nextBox(2, false), 1);
  assert.equal(L.nextBox(3, false), 1);
});
test("nextBox: out-of-range input is clamped, not trusted", () => {
  assert.equal(L.nextBox(0, true), 2);
  assert.equal(L.nextBox(9, true), 3);
  assert.equal(L.nextBox(undefined, true), 2);
  assert.equal(L.nextBox(9, false), 1);
});
test("nextBox: two correct answers in a row reach Learned", () => {
  assert.equal(L.nextBox(L.nextBox(1, true), true), L.LEARNED);
});

test("leitnerCounts: missing ids count as box 1", () => {
  assert.deepEqual(L.leitnerCounts(["a", "b", "c"], {}), { 1: 3, 2: 0, 3: 0, total: 3 });
});
test("leitnerCounts: counts per box and total", () => {
  assert.deepEqual(L.leitnerCounts(["a", "b", "c", "d"], { a: 2, b: 3, c: 3 }), { 1: 1, 2: 1, 3: 2, total: 4 });
});
test("leitnerCounts: ignores boxes for cards not in the list, clamps bad values", () => {
  assert.deepEqual(L.leitnerCounts(["a"], { a: 7, z: 2 }), { 1: 0, 2: 0, 3: 1, total: 1 });
  assert.deepEqual(L.leitnerCounts([], { a: 2 }), { 1: 0, 2: 0, 3: 0, total: 0 });
});
test("boxName", () => {
  assert.equal(L.boxName(1), "To review");
  assert.equal(L.boxName(2), "Learning");
  assert.equal(L.boxName(3), "Learned");
});
