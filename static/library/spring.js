/* SkillBridge spring solver. Semi-implicit Euler, dt clamped to 1/30s, resolves at rest.
   Every spring-driven motion on the page goes through this file. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

  // Damping ratio = damping / (2 * sqrt(stiffness * mass))
  var PRESETS = {
    camera: { stiffness: 90, damping: 15 },   // 0.79: about 2% overshoot, ~1.1s
    drawer: { stiffness: 170, damping: 20 },  // 0.77: about 2% overshoot
    pop:    { stiffness: 220, damping: 18 },  // 0.61: about 9% overshoot, the pop
    flip:   { stiffness: 200, damping: 24 },  // 0.85: nearly no overshoot
    stuck:  { stiffness: 400, damping: 12 }   // 0.30: a short shake
  };

  var REST_V = 0.001, REST_X = 0.0005;

  // One-shot form, as specified.
  function spring(from, to, cfg, onUpdate) {
    var stiffness = cfg.stiffness, damping = cfg.damping, mass = cfg.mass || 1;
    return new Promise(function (resolve) {
      if (reduce.matches) { onUpdate(to, 0); resolve(); return; }
      var x = from, v = cfg.velocity || 0, last = performance.now();
      function frame(now) {
        var dt = Math.min((now - last) / 1000, 1 / 30); last = now;
        var a = (-stiffness * (x - to) - damping * v) / mass;
        v += a * dt; x += v * dt;
        onUpdate(x, v);
        if (Math.abs(v) < REST_V && Math.abs(x - to) < REST_X) { onUpdate(to, 0); resolve(); return; }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  // Interruptible form: one value with a target. Re-targeting keeps the current velocity,
  // so a move that reverses mid-flight bends smoothly instead of restarting.
  function createSpring(cfg, onUpdate, initial) {
    var s = { x: initial || 0, v: 0, target: initial || 0, raf: 0, last: 0, waiting: [] };
    var mass = cfg.mass || 1;

    function finish() {
      s.x = s.target; s.v = 0; s.raf = 0;
      onUpdate(s.x, 0);
      var w = s.waiting; s.waiting = [];
      w.forEach(function (r) { r(); });
    }
    function frame(now) {
      var dt = Math.min((now - s.last) / 1000, 1 / 30); s.last = now;
      var a = (-cfg.stiffness * (s.x - s.target) - cfg.damping * s.v) / mass;
      s.v += a * dt; s.x += s.v * dt;
      if (Math.abs(s.v) < REST_V && Math.abs(s.x - s.target) < REST_X) { finish(); return; }
      onUpdate(s.x, s.v);
      s.raf = requestAnimationFrame(frame);
    }
    function run() {
      if (reduce.matches) { if (s.raf) cancelAnimationFrame(s.raf); finish(); return; }
      if (!s.raf) { s.last = performance.now(); s.raf = requestAnimationFrame(frame); }
    }

    s.to = function (target, opts) {
      s.target = target;
      if (opts && typeof opts.velocity === "number") s.v = opts.velocity;
      var p = new Promise(function (r) { s.waiting.push(r); });
      run();
      return p;
    };
    // Add velocity without moving the target: a kick (the stuck-drawer shake).
    s.kick = function (velocity) {
      s.v += velocity;
      var p = new Promise(function (r) { s.waiting.push(r); });
      run();
      return p;
    };
    s.jump = function (x) {
      if (s.raf) cancelAnimationFrame(s.raf);
      s.raf = 0; s.x = s.target = x; s.v = 0;
      onUpdate(x, 0);
    };
    s.moving = function () { return !!s.raf; };
    return s;
  }

  window.SkillBridge = window.SkillBridge || {};
  window.SkillBridge.spring = spring;
  window.SkillBridge.createSpring = createSpring;
  window.SkillBridge.PRESETS = PRESETS;
  window.SkillBridge.reducedMotion = function () { return reduce.matches; };
})();
