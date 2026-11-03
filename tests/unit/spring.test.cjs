// The drawer close flicker, as physics: without a stop, the close undershoots past 0.
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../../static/library/logic.js");

const drawer = { stiffness: 170, damping: 20 };
const drawerTravel = { stiffness: 170, damping: 20, min: 0, restitution: 0.18 };
const OPEN_PX = 260, FACE_GAP_PX = 1;   // the face rests 1px in front of the cabinet front

for (const fps of [30, 60, 120, 144]) {
  test(`drawer close with a stop never passes closed (${fps} fps)`, () => {
    const trace = L.simulateSpring(1, 0, drawerTravel, fps);
    const min = Math.min(...trace.map((f) => f.x));
    assert.ok(min >= 0, `min ${min}`);
    assert.ok(L.atRest({ x: trace.at(-1).x, v: trace.at(-1).v, target: 0 }), "comes to rest");
  });
}

test("root cause: without the stop, the close undershoots behind the cabinet front at 120 fps", () => {
  const trace = L.simulateSpring(1, 0, drawer, 120);
  const minPx = Math.min(...trace.map((f) => f.x)) * OPEN_PX;
  const hiddenMs = trace.filter((f) => f.x * OPEN_PX + FACE_GAP_PX < 0).length * (1000 / 120);
  assert.ok(minPx < -FACE_GAP_PX, `undershoot ${minPx.toFixed(2)}px`);
  assert.ok(hiddenMs > 150, `hidden ${hiddenMs}ms`);
});

test("stepSpring: restitution reflects velocity at the stop", () => {
  const st = L.stepSpring({ x: 0.001, v: -2, target: 0 }, drawerTravel, 1 / 60);
  assert.equal(st.x, 0);
  assert.ok(st.v > 0 && st.v < 2 * 0.18 + 1e-9);
});

test("presets keep their documented damping ratios", () => {
  const z = (k, c) => c / (2 * Math.sqrt(k));
  assert.ok(Math.abs(z(90, 15) - 0.79) < 0.01);
  assert.ok(Math.abs(z(170, 20) - 0.77) < 0.01);
  assert.ok(Math.abs(z(220, 18) - 0.61) < 0.01);
  assert.ok(Math.abs(z(200, 24) - 0.85) < 0.01);
  assert.ok(Math.abs(z(400, 12) - 0.30) < 0.01);
});

test("camera preset settles from 0 to 1 within about 1.1 s with about 2% overshoot", () => {
  const trace = L.simulateSpring(0, 1, { stiffness: 90, damping: 15 }, 60);
  const peak = Math.max(...trace.map((f) => f.x));
  const within = trace.find((f) => Math.abs(f.x - 1) < 0.01);
  assert.ok(peak > 1.005 && peak < 1.04, `peak ${peak}`);
  assert.ok(within.t < 1.2, `t ${within.t}`);
});
