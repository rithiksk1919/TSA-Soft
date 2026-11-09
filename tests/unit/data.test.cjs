// Data integrity: every drawer's mock data is well formed, and the worked numbers are right.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../static/library/logic.js");
const load = (f) => require("../../static/library/data/" + f);
const cards = load("cards.json"), mistakes = load("mistakes.json"), worked = load("worked.json");
const diag = load("diagnostic.json"), history = load("history.json"), drawers = load("drawers.json");
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const rad = (d) => (d * Math.PI) / 180;

test("cards.json: 6 mistakes, 12 cards, every answer index valid, ids unique", () => {
  assert.equal(cards.mistakes.length, 6);
  const all = cards.mistakes.flatMap((m) => m.cards);
  assert.equal(all.length, 12);
  assert.equal(new Set(all.map((c) => c.id)).size, 12);
  for (const c of all) { assert.ok(c.answer >= 0 && c.answer < c.options.length, c.id); assert.ok(c.explain.length > 20, c.id); }
});

test("mistakes.json: extras for exactly the 6 mistakes, call numbers match", () => {
  const ids = cards.mistakes.map((m) => m.id).sort();
  assert.deepEqual(Object.keys(mistakes.mistakes).sort(), ids);
  for (const m of cards.mistakes) {
    const x = mistakes.mistakes[m.id];
    assert.equal(x.callNumber, m.call);
    for (const k of ["timesMade", "lastSeenDays", "explanation", "wrongExample", "rightExample"]) assert.ok(x[k] !== undefined, m.id + " " + k);
  }
});

test("worked.json: one example per mistake, 4-6 steps, exactly one common-mistake step, valid check", () => {
  assert.equal(worked.examples.length, 6);
  assert.deepEqual(worked.examples.map((e) => e.mistake).sort(), cards.mistakes.map((m) => m.id).sort());
  for (const e of worked.examples) {
    assert.ok(e.steps.length >= 4 && e.steps.length <= 6, e.id);
    assert.equal(e.steps.filter((s) => s.mistake).length, 1, e.id);
    assert.ok(e.steps.find((s) => s.mistake).watch, e.id + " watch note");
    assert.ok(e.check.answer >= 0 && e.check.answer < e.check.options.length, e.id);
  }
});

test("worked examples: the arithmetic is right", () => {
  near(2.0 * 9.8 * Math.cos(rad(30)), 17.0, 0.05);   // incline normal force
  near(19.6 * Math.cos(rad(45)), 13.9, 0.05);        // check question
  near(12 + -9.8 * 2.0, -7.6, 1e-9);                 // thrown ball at 2.0 s
  near(12 / 9.8, 1.2, 0.03);                         // time to the top
  near(12 + -9.8 * 1.0, 2.2, 1e-9);                  // check question
  near(8.0 / (2 * 16.0), 0.25, 1e-9);                // grams of O2 to moles
  near(16 / 32.0, 0.5, 1e-9);
  near(3.0 * 2 * 18.02, 108.12, 1e-9);               // water mass
  near(1.5 * 2, 3.0, 1e-9);
});

test("diagnostic.json: 15 questions, 5 per subject, difficulty in 0..1, valid answers", () => {
  assert.equal(diag.questions.length, 15);
  for (const s of ["physics", "chemistry", "biology"]) assert.equal(diag.questions.filter((q) => q.subject === s).length, 5);
  for (const q of diag.questions) {
    assert.ok(q.difficulty >= 0 && q.difficulty <= 1, q.id);
    assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id);
    assert.ok(q.skill && q.explain, q.id);
  }
  near(20 / 5.0, 4.0, 1e-9);
  near(-9.8 * 1.5, -14.7, 1e-9);
  near(5.0 * 9.8 * Math.cos(rad(20)), 46, 0.1);
  near(2.0 * 9.8 * 1.5, 29.4, 1e-9);
  near(12.01 + 2 * 16.0, 44.01, 1e-9);
  near(0.5 * 58.44, 29.22, 1e-9);
  near(6.0 * (2 / 3), 4.0, 1e-9);
  near(2 * 32.0, 64, 1e-9);
});

test("history.json: 12 attempts, newest first, outcome scores follow the formula", () => {
  assert.equal(history.attempts.length, 12);
  const dates = history.attempts.map((a) => a.date);
  assert.deepEqual([...dates].sort().reverse(), dates);
  const scores = history.attempts.map((a) => L.round2(L.outcomeScore(a.solved, a.attempts, a.hints)));
  assert.deepEqual(scores, [0.65, 1, 0, 0.4, 0.85, 1, 0, 0.8, 1, 0.85, 0.4, 0]);
  assert.deepEqual(L.historySummary(history.attempts), { attempts: 12, solvedPct: 75, avgHints: 1.08, solvedNoHints: 4 });
  for (const a of history.attempts) for (const [t, kind] of a.actions) {
    assert.match(t, /^\d\d:\d\d$/);
    assert.ok(["edit", "run", "hint", "submit"].includes(kind), a.id + " " + kind);
  }
});

test("drawers.json: six drawers with a count kind each", () => {
  assert.equal(drawers.drawers.length, 6);
  for (const d of drawers.drawers) assert.ok(["cards", "mistakes", "examples", "questions", "attempts", "learned"].includes(d.count));
});

/* ---------- Reading desk (data/desk.json) ---------- */

const desk = load("desk.json"), shelf = load("subjects.json");

test("desk.json: one scenario per subject's next problem, every question and step well formed", () => {
  assert.deepEqual(desk.scenarios.map((s) => s.id), shelf.subjects.map((s) => s.next.id));
  for (const sc of desk.scenarios) {
    assert.equal(sc.subject, shelf.subjects.find((s) => s.next.id === sc.id).id, sc.id);
    for (const q of [sc.read, sc.why, sc.fix]) {
      assert.ok(q.answer >= 0 && q.answer < q.options.length, sc.id + " " + q.question);
      for (const k of ["question", "right", "wrong"]) assert.ok(q[k].length > 5, sc.id + " " + k);
    }
    assert.equal(sc.steps.filter((s) => s.wrong).length, 1, sc.id + ": exactly one wrong step");
    assert.ok(sc.steps[sc.steps.length - 1].wrong, sc.id + ": steps stop at the wrong one; the rest is in after");
    for (const st of sc.steps) {
      assert.ok(st.text && st.say && st.focus.length, sc.id);
      if (st.wrong) assert.ok(st.missed && st.caught, sc.id); else assert.ok(st.ok && st.nudge, sc.id);
    }
    for (const k of ["read", "check", "fix"]) assert.ok(sc.hints[k].length >= 2, sc.id + " hints " + k);
    assert.ok(["incline", "chain", "codons"].includes(sc.figure), sc.id);
    assert.ok(sc.fixed.length > 5 && sc.result && sc.rule && sc.after.length >= 1, sc.id);
  }
});

test("desk scenarios: the arithmetic is right", () => {
  // Physics: a = (mg sin 30 - mu mg cos 30) / m; the classmate used N = mg.
  const m = 2.0, g = 9.8, mu = 0.2;
  near((m * g * Math.sin(rad(30)) - mu * m * g * Math.cos(rad(30))) / m, 3.2, 0.01);
  near((m * g * Math.sin(rad(30)) - mu * m * g) / m, 2.9, 0.05);
  near(m * g * Math.cos(rad(30)), 17.0, 0.03);
  // Chemistry: 8.0 g O2 -> 0.25 mol -> 0.50 mol H2O -> 9.0 g; the classmate divided: 0.028 g.
  const nO2 = 8.0 / 32.0, nH2O = 2 * nO2;
  near(nH2O * 18.02, 9.0, 0.02);
  near(nH2O / 18.02, 0.028, 0.0005);
  near(8.0 + nH2O * 2.016, 9.0, 0.02);
  // Biology: transcribe the template, translate to the first stop.
  const pair = { T: "A", A: "U", C: "G", G: "C" };
  const mrna = "TAC AAG CCT ATT GCA".split(" ").map((c) => [...c].map((b) => pair[b]).join(""));
  assert.deepEqual(mrna, ["AUG", "UUC", "GGA", "UAA", "CGU"]);
  const code = { AUG: "Met", UUC: "Phe", GGA: "Gly", UAA: "Stop", CGU: "Arg" }, protein = [];
  for (const c of mrna) { if (code[c] === "Stop") break; protein.push(code[c]); }
  assert.equal(protein.join("–"), desk.scenarios[2].result);
});
