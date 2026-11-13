// The gym as a CSS 3D room, in the library's construction and light: a maple court with painted
// lines, padded walls, high windows, gym lights, bleachers, a ball rack and a scoreboard that keeps
// the game's score. Four stations stand on the court, one per game, and the camera flies to each:
//
//   Bug Hoops (back right)   a hoop the player's ball really flies into (or off)
//   Dodgeball (back left)    a ball launcher that fires at the camera: dodge, catch, or get hit
//   Loop Laps (front left)   a running track; the runner runs one lap per pass of the loop
//   Ohm Toss (front right)   four answer rings painted on the floor and a beanbag to toss
//
// Everything moves with transforms only (WAAPI keyframes or the room's camera), and every
// animation resolves at once under prefers-reduced-motion.
import { px, plane, box, shade, play } from "./rooms3d.js";
import { BACK, H, shell, mountRoom, group } from "./classroom3d.js";

const P = 1500;                            // the room's perspective, in world units (classroom3d.js)
const HOOP = { x: 430, rimY: -500, rimZ: BACK + 170 };
const START = { x: 20, y: -24, z: 40 };   // where the hoops ball rests (its centre)
const R = 24;                              // the hoops ball's radius
const MACHINE = { x: -590, z: BACK + 150 };
const MOUTH = { x: MACHINE.x, y: -174, z: MACHINE.z + 150 };   // just in front of the barrel
const TRACK = { x: -250, z: -230, rx: 230, rz: 105 };
const RINGS = [{ x: 170, z: -90 }, { x: 330, z: -180 }, { x: 490, z: -90 }, { x: 650, z: -180 }];

// Camera poses. While a game's panel is open the scene's projection centre shifts right (CSS,
// .gym3c.is-playing), so each pose simply centres its station.
const POSES = {
  overview: { ox: -20, oy: -300, oz: -330, depth: -560, yaw: 0, pitch: -13 },
  hoops: { ox: 360, oy: -420, oz: -430, depth: -330, yaw: 0, pitch: -6 },
  dodge: { ox: -500, oy: -250, oz: -420, depth: -260, yaw: 0, pitch: -5 },
  dodgeDuck: { ox: -590, oy: -230, oz: -420, depth: -260, yaw: 3, pitch: -5 },
  laps: { ox: -250, oy: -170, oz: -270, depth: -300, yaw: 0, pitch: -18 },
  toss: { ox: 410, oy: -70, oz: -135, depth: -60, yaw: 0, pitch: -22 }
};

const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// Where the eye is for a pose: the camera orbits its target (ox, oy, oz) at distance P - depth,
// tilted by pitch and turned by yaw (the inverse of mountRoom's camera transform).
function eyeOf(pose) {
  const d = P - pose.depth;
  const p = pose.pitch * Math.PI / 180;
  const y = pose.yaw * Math.PI / 180;
  const flat = Math.cos(p) * d;
  return { x: pose.ox - Math.sin(y) * flat, y: pose.oy + Math.sin(p) * d, z: pose.oz + Math.cos(y) * flat };
}

// A point on the line from a pose's eye to its target: t = 0 at the eye, 1 at the target.
function along(pose, t, dx, dy) {
  const e = eyeOf(pose);
  return { x: e.x + (pose.ox - e.x) * t + (dx || 0), y: e.y + (pose.oy - e.y) * t + (dy || 0), z: e.z + (pose.oz - e.z) * t };
}

// Points along legs of parabolas, as keyframes (transform only). Each leg: from, to, lift (how far
// above the straight line it rises), t (seconds), fall (ease in, like gravity), extra (a transform
// suffix such as a spin).
function flight(legs3, extra) {
  const total = legs3.reduce(function (a, l) { return a + l.t; }, 0);
  const frames = [];
  const floor = [];
  let t = 0;
  let spin = 0;
  for (let i = 0; i < legs3.length; i = i + 1) {
    const l = legs3[i];
    const n = Math.max(6, Math.round(l.t * 50));
    for (let k = i === 0 ? 0 : 1; k <= n; k = k + 1) {
      const u = k / n;
      const e = l.fall ? u * u : u;
      const x = l.from.x + (l.to.x - l.from.x) * e;
      const z = l.from.z + (l.to.z - l.from.z) * e;
      const y = l.from.y + (l.to.y - l.from.y) * e - l.lift * 4 * u * (1 - u);
      spin = spin + (l.spin === undefined ? 7 : l.spin);
      const offset = (t + l.t * u) / total;
      frames.push({ offset: offset, transform: "translate3d(" + px(x) + "," + px(y) + "," + px(z) + ")" + (extra ? extra(spin, l, u) : " rotateZ(" + spin.toFixed(1) + "deg)") });
      floor.push({ x: x, y: y, z: z, offset: offset });
    }
    t = t + l.t;
  }
  return { frames: frames, points: floor, ms: total * 1000 };
}

function shadowFrames(points, size) {
  return points.map(function (p) {
    const lift = Math.min(1, (-p.y - size) / 400);
    return { offset: p.offset, opacity: (1 - lift * 0.85).toFixed(3),
      transform: "translate3d(" + px(p.x + 6) + ",-0.6px," + px(p.z + 4) + ") rotateX(90deg) scale(" + (1 - lift * 0.55).toFixed(3) + ")" };
  });
}

function cancel(els) {
  for (const el of els) {
    for (const a of el.getAnimations()) {
      a.cancel();
    }
  }
}

/* ---------------- the room ---------------- */

function highWindows(world) {
  for (const x of [-560, -300, -40]) {
    plane(world, { cls: "c3win c3win--high", x: x, y: -660, z: BACK + 1, w: 190, h: 110,
      html: '<span class="c3win__view"></span><span class="c3win__bar c3win__bar--v"></span>' });
    plane(world, { cls: "c3sun c3sun--gym", x: x + 90, y: -0.4, z: BACK + 420, w: 230, h: 520, rx: 90, rz: -12 });
  }
}

function court(world) {
  // the key under the hoop, the free-throw circle, the centre line and circle, and a 3-point arc
  plane(world, { cls: "court3 court3--key", x: HOOP.x, y: -0.3, z: BACK + 230, w: 240, h: 420, rx: 90 });
  plane(world, { cls: "court3 court3--circle", x: HOOP.x, y: -0.35, z: BACK + 440, w: 240, h: 240, rx: 90 });
  plane(world, { cls: "court3 court3--arc", x: HOOP.x, y: -0.32, z: BACK + 120, w: 900, h: 900, rx: 90 });
  plane(world, { cls: "court3 court3--line", x: -40, y: -0.3, z: -200, w: 5, h: 1000, rx: 90 });
}

function hoop(world) {
  const x = HOOP.x;
  shade(world, { cls: "sh3--strip", x: x, z: BACK + 60, w: 180, h: 70 });
  box(world, { cls: "metal3 metal3--dark", x: x, y: 0, z: BACK + 40, w: 22, h: 650, d: 22, faces: "front left right" });
  box(world, { cls: "padding3", x: x, y: 0, z: BACK + 40, w: 34, h: 140, d: 34, faces: "front left right top" });
  box(world, { cls: "metal3 metal3--dark", x: x, y: -560, z: BACK + 84, w: 10, h: 10, d: 80, faces: "front left right bottom" });
  box(world, { cls: "board3", x: x, y: -520, z: BACK + 128, w: 240, h: 160, d: 8, faces: "front top left right bottom",
    html: { front: '<span class="board3__square"></span>' } });
  // the rim (a ring lying flat), its bracket, and the net hanging from it
  box(world, { cls: "rim3__bracket", x: x, y: HOOP.rimY - 2, z: BACK + 146, w: 20, h: 8, d: 24, faces: "front top left right" });
  plane(world, { cls: "rim3 rim3--big", x: x, y: HOOP.rimY, z: HOOP.rimZ, w: 92, h: 92, rx: 90 });
  return plane(world, { cls: "net3 net3--big", x: x, y: HOOP.rimY + 34, z: HOOP.rimZ, w: 86, h: 66 });
}

function scoreboard(world) {
  box(world, { cls: "sb3", x: -40, y: -470, z: BACK + 14, w: 380, h: 170, d: 24, faces: "front top left right bottom",
    html: { front: '<span class="sb3__face"><span class="sb3__cell"><i data-sb-label="round">Round</i><b data-sb="round">-</b></span>' +
      '<span class="sb3__cell"><i>Score</i><b data-sb="score">0</b></span><span class="sb3__cell"><i>Streak</i><b data-sb="streak">0</b></span></span>' } });
}

function bleachers(world) {
  // four stepped rows along the left wall, each further back and higher than the one before
  shade(world, { cls: "sh3--deep", x: -760, z: -340, w: 220, h: 700 });
  for (let r = 0; r < 4; r = r + 1) {
    box(world, { cls: "wood wood--warm", x: -720 - r * 44, y: 0, z: -340, w: 44, h: 40 + r * 40, d: 560, faces: "front top right" });
  }
}

function rack(world) {
  const x = 800;
  const z = -300;
  shade(world, { x: x - 10, z: z, w: 140, h: 220 });
  for (const dz of [-80, 80]) {
    box(world, { cls: "metal3", x: x, y: 0, z: z + dz, w: 8, h: 120, d: 8, faces: "front left right" });
  }
  box(world, { cls: "metal3", x: x, y: -112, z: z, w: 60, h: 8, d: 170 });
  box(world, { cls: "metal3", x: x, y: -40, z: z, w: 60, h: 8, d: 170 });
  for (const b of [[-50, -138], [0, -138], [50, -138], [-30, -66], [30, -66]]) {
    plane(world, { cls: "ball3 ball3--rack", x: x, y: b[1], z: z + b[0], w: 40, h: 40, html: '<span class="ball3__seams"></span>' });
  }
}

function lights(world) {
  // flush panels in the ceiling, and the light they throw on the court
  for (const x of [-480, 0, 480]) {
    for (const z of [-480, -120, 240]) {
      plane(world, { cls: "ceil-light3", x: x, y: -H + 1, z: z, w: 170, h: 90, rx: -90 });
    }
    plane(world, { cls: "c3pool c3pool--gym", x: x, y: -0.6, z: -160, w: 640, h: 900, rx: 90 });
  }
}

function pennants(world) {
  const colors = ["#4F6B45", "#B8964A", "#9B3A28", "#2D4A6E", "#4F6B45", "#B8964A"];
  plane(world, { cls: "string3", x: -420, y: -800, z: BACK + 1.2, w: 700, h: 3 });
  for (let i = 0; i < colors.length; i = i + 1) {
    plane(world, { cls: "pennant3", x: -710 + i * 116, y: -778, z: BACK + 1.5, w: 48, h: 46, style: ";--c:" + colors[i] });
  }
}

// A station: a group the player can click (data-station), a glow on the floor and its name, either
// on a sign on the back wall ({ x, y }), or none where the station speaks for itself (the track
// with its lap board, the rings with their numbers).
function station(world, name, verb, title, glow, sign) {
  const g = group(world, "station3c", "", { "data-station": name });
  // sh3--live: the glow fades in and out, so it must stay its own plane (not baked into the floor)
  shade(g, { cls: "glow3c sh3--live", x: glow.x, y: -0.7, z: glow.z, w: glow.w, h: glow.h });
  const html = '<span class="plaque3__verb">' + verb + '</span><span class="plaque3__name">' + title + "</span>";
  if (sign) {
    plane(g, { cls: "plaque3 wallsign3", x: sign.x, y: sign.y, z: BACK + 3, w: 280, h: 84, html: html });
  }
  return g;
}

/* the dodgeball launcher: a cabinet with a barrel that points down the court */
function launcher(g) {
  const x = MACHINE.x;
  const z = MACHINE.z;
  shade(g, { cls: "sh3--deep", x: x + 8, z: z + 10, w: 170, h: 170 });
  box(g, { cls: "machine3", x: x, y: 0, z: z, w: 130, h: 120, d: 130, html: { front: '<span class="machine3__panel"><i></i><i></i><i></i></span>' } });
  box(g, { cls: "machine3 machine3--top", x: x, y: -120, z: z, w: 100, h: 20, d: 100, faces: "front top left right" });
  // the hopper of balls waiting their turn
  box(g, { cls: "hopper3", x: x, y: -140, z: z - 20, w: 96, h: 40, d: 70, faces: "front left right" });
  for (const b of [[-28, -176], [6, -180], [34, -174]]) {
    plane(g, { cls: "ball3 dodge3", x: x + b[0], y: b[1], z: z - 26, w: 34, h: 34 });
  }
  // the barrel, pointing at the player
  const barrel = box(g, { cls: "barrel3", x: x, y: -174, z: z + 70, w: 72, h: 72, d: 90, faces: "front top left right bottom",
    html: { front: '<span class="barrel3__mouth"></span>' } });
  return barrel;
}

/* the running track: a lane, a start line and cones */
function track(g) {
  plane(g, { cls: "track3", x: TRACK.x, y: -0.36, z: TRACK.z, w: TRACK.rx * 2 + 80, h: TRACK.rz * 2 + 80, rx: 90 });
  plane(g, { cls: "track3 track3--inner", x: TRACK.x, y: -0.4, z: TRACK.z, w: TRACK.rx * 2 - 80, h: TRACK.rz * 2 - 80, rx: 90 });
  plane(g, { cls: "track3__start", x: TRACK.x, y: -0.44, z: TRACK.z + TRACK.rz, w: 8, h: 80, rx: 90 });
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const cx = TRACK.x + (TRACK.rx - 70) * Math.cos(a);
    const cz = TRACK.z + (TRACK.rz - 60) * Math.sin(a);
    box(g, { cls: "cone3", x: cx, y: 0, z: cz, w: 22, h: 34, d: 22, faces: "front left right top" });
  }
}

/* the lap board, on the back wall above the track */
function buildLapBoard(g) {
  box(g, { cls: "lapboard3", x: TRACK.x, y: -270, z: BACK + 10, w: 300, h: 120, d: 14, faces: "front top left right bottom",
    html: { front: '<span class="lapboard3__face"><b data-lap="n">LAP -</b><span data-lap="vars">ready</span></span>' } });
}

/* a runner: a flat figure that faces the camera, with swinging arms and legs */
function runner(world) {
  const shadow = shade(world, { cls: "sh3--deep sh3--live", x: TRACK.x, z: TRACK.z + TRACK.rz, w: 50, h: 22 });
  const el = plane(world, { cls: "runner3", x: TRACK.x, y: -60, z: TRACK.z + TRACK.rz, w: 60, h: 120,
    html: '<span class="runner3__fig"><i class="runner3__head"></i><i class="runner3__arm runner3__arm--b"></i><i class="runner3__leg runner3__leg--b"></i>' +
      '<i class="runner3__body"></i><i class="runner3__leg runner3__leg--f"></i><i class="runner3__arm runner3__arm--f"></i></span>' });
  return { el: el, shadow: shadow };
}

/* the toss rings and their numbers */
function rings(g) {
  const out = [];
  for (let i = 0; i < RINGS.length; i = i + 1) {
    const r = RINGS[i];
    out.push(plane(g, { cls: "ring3", x: r.x, y: -0.5, z: r.z, w: 170, h: 170, rx: 90,
      html: '<span class="ring3__label">-</span><span class="ring3__tag">' + "ABCD"[i] + "</span>" }));
  }
  return out;
}

// Builds the gym and returns the room with each game's moves.
export function buildGym(stage) {
  let net = null;
  let barrel = null;
  let ringEls = [];
  const room = mountRoom(stage, POSES, function (world) {
    shell(world, "gym");
    highWindows(world);
    court(world);
    pennants(world);
    scoreboard(world);
    bleachers(world);
    rack(world);
    lights(world);
    const hoops = station(world, "hoops", "Transfer check", "Bug Hoops",
      { x: HOOP.x, z: BACK + 300, w: 520, h: 360 }, { x: 740, y: -330 });
    net = hoop(hoops);
    const dodge = station(world, "dodgeball", "Bug or clean?", "Dodgeball",
      { x: MACHINE.x, z: MACHINE.z + 60, w: 420, h: 380 }, { x: -600, y: -330 });
    barrel = launcher(dodge);
    const laps = station(world, "laps", "Trace the loop", "Loop Laps",
      { x: TRACK.x, z: TRACK.z, w: 700, h: 420 }, null);
    track(laps);
    buildLapBoard(laps);
    const toss = station(world, "toss", "Land the value", "Ohm Toss",
      { x: 410, z: -135, w: 720, h: 360 }, null);
    ringEls = rings(toss);
    return [hoops, dodge, laps, toss];
  }, { minWidth: 1500 });
  const world = room.world;
  const stations = Array.from(stage.querySelectorAll(".station3c"));

  // the hoops ball and its shadow
  const shadow = shade(world, { cls: "sh3--deep sh3--live", x: START.x + 6, z: START.z + 4, w: 60, h: 28 });
  const ball = plane(world, { cls: "ball3 ball3--player", x: START.x, y: START.y, z: START.z, w: R * 2, h: R * 2, html: '<span class="ball3__seams"></span>' });
  // the dodgeball in the launcher's mouth, the runner and the beanbag
  const dodgeball = plane(world, { cls: "ball3 dodge3 dodge3--live", x: MOUTH.x, y: MOUTH.y, z: MOUTH.z, w: 64, h: 64 });
  const run = runner(world);
  const bagShadow = shade(world, { cls: "sh3--deep sh3--live bag3__shadow", x: 0, z: 0, w: 50, h: 30 });
  const bag = plane(world, { cls: "bag3", x: 0, y: 0, z: 0, w: 46, h: 40 });
  bag.style.opacity = "0";
  bagShadow.style.opacity = "0";
  const flash = document.createElement("div");
  flash.className = "gym-flash";
  flash.setAttribute("aria-hidden", "true");
  stage.parentNode.appendChild(flash);

  /* ---- Bug Hoops ---- */
  function shoot(made) {
    const above = { x: HOOP.x, y: HOOP.rimY - 140, z: HOOP.rimZ };
    const legs3 = [{ from: START, to: START, lift: 50, t: 0.4 }];
    if (made) {
      legs3.push({ from: START, to: { x: HOOP.x, y: HOOP.rimY - 26, z: HOOP.rimZ }, lift: 260, t: 1.05, peak: above });
      legs3.push({ from: { x: HOOP.x, y: HOOP.rimY - 26, z: HOOP.rimZ }, to: { x: HOOP.x, y: HOOP.rimY + 70, z: HOOP.rimZ }, lift: 0, t: 0.28, fall: true, net: true });
      legs3.push({ from: { x: HOOP.x, y: HOOP.rimY + 70, z: HOOP.rimZ }, to: { x: HOOP.x - 30, y: -R, z: HOOP.rimZ + 70 }, lift: 0, t: 0.42, fall: true });
      legs3.push({ from: { x: HOOP.x - 30, y: -R, z: HOOP.rimZ + 70 }, to: { x: HOOP.x - 140, y: -R, z: HOOP.rimZ + 230 }, lift: 70, t: 0.55 });
      legs3.push({ from: { x: HOOP.x - 140, y: -R, z: HOOP.rimZ + 230 }, to: { x: HOOP.x - 200, y: -R, z: HOOP.rimZ + 320 }, lift: 22, t: 0.35 });
    } else {
      const front = { x: HOOP.x - 20, y: HOOP.rimY - 10, z: HOOP.rimZ + 46 };
      legs3.push({ from: START, to: front, lift: 250, t: 1.0 });
      legs3.push({ from: front, to: { x: HOOP.x - 230, y: -R, z: HOOP.rimZ + 360 }, lift: 60, t: 0.75 });
      legs3.push({ from: { x: HOOP.x - 230, y: -R, z: HOOP.rimZ + 360 }, to: { x: HOOP.x - 330, y: -R, z: HOOP.rimZ + 470 }, lift: 40, t: 0.45 });
      legs3.push({ from: { x: HOOP.x - 330, y: -R, z: HOOP.rimZ + 470 }, to: { x: HOOP.x - 370, y: -R, z: HOOP.rimZ + 520 }, lift: 12, t: 0.3 });
    }
    let netAt = -1;
    let t = 0;
    const total = legs3.reduce(function (a, l) { return a + l.t; }, 0);
    for (const l of legs3) {
      if (l.net) {
        netAt = t / total;
      }
      t = t + l.t;
    }
    const f = flight(legs3);
    if (calm.matches) {
      return Promise.resolve();
    }
    play(shadow, shadowFrames(f.points, R), { duration: f.ms, fill: "forwards" });
    if (netAt >= 0) {
      const base = net.style.transform;
      play(net, [
        { transform: base, offset: 0 }, { transform: base, offset: netAt },
        { transform: base + " scaleY(1.3) translateY(4px)", offset: Math.min(1, netAt + 0.05) },
        { transform: base + " scaleY(.9)", offset: Math.min(1, netAt + 0.11) },
        { transform: base, offset: Math.min(1, netAt + 0.17) }, { transform: base, offset: 1 }
      ], { duration: f.ms });
    }
    return play(ball, f.frames, { duration: f.ms, fill: "forwards" });
  }

  /* ---- Dodgeball ---- */
  // Loads a ball: it pops up out of the hopper into the barrel's mouth and waits there.
  function loadBall() {
    cancel([dodgeball, barrel]);
    dodgeball.classList.add("dodge3--ready");
    if (calm.matches) {
      return Promise.resolve();
    }
    const at = "translate3d(" + px(MOUTH.x) + "," + px(MOUTH.y) + "," + px(MOUTH.z) + ")";
    return play(dodgeball, [
      { transform: "translate3d(" + px(MOUTH.x) + "," + px(MOUTH.y + 30) + "," + px(MOUTH.z - 60) + ") scale(.5)", opacity: 0 },
      { transform: "translate3d(" + px(MOUTH.x) + "," + px(MOUTH.y - 50) + "," + px(MOUTH.z - 20) + ") scale(.9)", opacity: 1, offset: 0.6 },
      { transform: at, opacity: 1 }
    ], { duration: 520, easing: "ease-out" });
  }

  // Fires the ball. how: "dodge" (the camera sidesteps and it flies past), "catch" (it stops in
  // the player's hands) or "hit" (it smacks into the camera; the screen shakes).
  async function fire(how) {
    dodgeball.classList.remove("dodge3--ready");
    if (calm.matches) {
      return;
    }
    const pose = POSES.dodge;
    const legs3 = [];
    // the barrel kicks back as it fires
    play(barrel, [
      { transform: barrel.style.transform },
      { transform: barrel.style.transform + " translateZ(-18px) scale(1.04)", offset: 0.2 },
      { transform: barrel.style.transform }
    ], { duration: 360, easing: "ease-out" });
    if (how === "dodge") {
      room.fly("dodgeDuck", 260);
      // it flies where the player's head was, then on past their shoulder and out of view
      const by = along(pose, 0.55, 0, 40);
      legs3.push({ from: MOUTH, to: by, lift: 120, t: 0.62, spin: 9 });
      legs3.push({ from: by, to: along(pose, 0.8, 520, 60), lift: 0, t: 0.32, spin: 9 });
    } else if (how === "catch") {
      legs3.push({ from: MOUTH, to: along(pose, 0.68, 0, 70), lift: 140, t: 0.78, spin: 6 });
    } else {
      legs3.push({ from: MOUTH, to: along(pose, 0.8, 0, 40), lift: 90, t: 0.6, spin: 11 });
    }
    const f = flight(legs3);
    await play(dodgeball, f.frames, { duration: f.ms, fill: "forwards" });
    const last = f.frames[f.frames.length - 1].transform;
    if (how === "catch") {
      stage.parentNode.classList.add("gym-caught");
      await play(dodgeball, [
        { transform: last }, { transform: last + " scale(.86, 1.08)", offset: 0.3 }, { transform: last + " scale(1)", offset: 0.6 },
        { transform: last + " scale(1)", opacity: 1, offset: 0.85 }, { transform: last + " translateY(80px) scale(.8)", opacity: 0 }
      ], { duration: 900, fill: "forwards" });
      stage.parentNode.classList.remove("gym-caught");
    } else if (how === "hit") {
      flash.classList.add("is-on");
      play(stage, [
        { transform: "translate(0, 0)" }, { transform: "translate(-14px, 6px) rotate(-.6deg)" }, { transform: "translate(12px, -8px) rotate(.5deg)" },
        { transform: "translate(-8px, 4px)" }, { transform: "translate(5px, -2px)" }, { transform: "translate(0, 0)" }
      ], { duration: 420, easing: "ease-out" });
      await play(dodgeball, [
        { transform: last, opacity: 1 }, { transform: last + " scale(1.15, .8)", opacity: 1, offset: 0.15 },
        { transform: last + " translate(-140px, 420px) rotate(80deg)", opacity: 0 }
      ], { duration: 700, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
      flash.classList.remove("is-on");
    } else {
      await play(dodgeball, [{ opacity: 1, transform: last }, { opacity: 0, transform: last }], { duration: 120, fill: "forwards" });
      await room.fly("dodge", 420);
    }
  }

  /* ---- Loop Laps ---- */
  const lapN = stage.querySelector('[data-lap="n"]');
  const lapVars = stage.querySelector('[data-lap="vars"]');
  function lapBoard(lap, vars) {
    lapN.textContent = lap === null ? "LAP -" : "LAP " + lap;
    lapVars.textContent = vars || "ready";
  }
  function runnerAt(a) {
    return { x: TRACK.x + TRACK.rx * Math.cos(a), z: TRACK.z + TRACK.rz * Math.sin(a) };
  }
  function resetRunner() {
    cancel([run.el, run.shadow]);
    run.el.classList.remove("is-running");
    lapBoard(null, "ready");
  }
  // Runs one lap per row of the trace; onLap(i) fires as the runner crosses the line each time.
  async function runLaps(count, onLap) {
    resetRunner();
    if (calm.matches) {
      for (let i = 0; i < count; i = i + 1) {
        onLap(i);
      }
      return;
    }
    const ms = Math.max(650, Math.min(1100, 4800 / Math.max(1, count)));
    run.el.classList.add("is-running");
    for (let i = 0; i < count; i = i + 1) {
      const frames = [];
      const shadows = [];
      const n = 48;
      for (let k = 0; k <= n; k = k + 1) {
        // counter-clockwise seen from above: across the front to the right, round the back
        const a = Math.PI / 2 - (k / n) * Math.PI * 2;
        const p = runnerAt(a);
        const ahead = runnerAt(a - 0.05);
        const face = ahead.x >= p.x ? 1 : -1;
        const bob = Math.abs(Math.sin(k / n * Math.PI * 12)) * -8;
        frames.push({ transform: "translate3d(" + px(p.x) + "," + px(-60 + bob) + "," + px(p.z) + ") scaleX(" + face + ")" });
        shadows.push({ transform: "translate3d(" + px(p.x) + ",-0.6px," + px(p.z) + ") rotateX(90deg)" });
      }
      play(run.shadow, shadows, { duration: ms, fill: "forwards" });
      await play(run.el, frames, { duration: ms, fill: "forwards" });
      onLap(i);
    }
    run.el.classList.remove("is-running");
  }

  /* ---- Ohm Toss ---- */
  function setRings(labels) {
    for (let i = 0; i < ringEls.length; i = i + 1) {
      ringEls[i].classList.remove("is-right", "is-wrong", "is-key");
      ringEls[i].querySelector(".ring3__label").textContent = labels[i] || "";
    }
    cancel([bag, bagShadow]);
    bag.style.opacity = "0";
    bagShadow.style.opacity = "0";
  }
  // Tosses the beanbag onto ring i; the ring lights up right or wrong, and the right one glows.
  async function toss(i, correct, key) {
    // from low in the player's view, out over the rings
    const from = along(POSES.toss, 0.6, -40, 260);
    const to = { x: RINGS[i].x, y: -6, z: RINGS[i].z };
    const f = flight([
      { from: from, to: from, lift: 40, t: 0.25, spin: 0 },
      { from: from, to: to, lift: 300, t: 0.9, spin: 12 }
    ]);
    bag.style.opacity = "1";
    bagShadow.style.opacity = "1";
    if (!calm.matches) {
      play(bagShadow, shadowFrames(f.points, 20), { duration: f.ms, fill: "forwards" });
      await play(bag, f.frames, { duration: f.ms, fill: "forwards" });
      const last = f.frames[f.frames.length - 1].transform;
      // it lands flat and squashes
      await play(bag, [
        { transform: last },
        { transform: "translate3d(" + px(to.x) + ",-3px," + px(to.z) + ") rotateX(90deg) scale(1.25, .8)", offset: 0.4 },
        { transform: "translate3d(" + px(to.x) + ",-3px," + px(to.z) + ") rotateX(90deg)" }
      ], { duration: 260, easing: "ease-out", fill: "forwards" });
    } else {
      bag.style.transform = "translate3d(" + px(to.x) + ",-3px," + px(to.z) + ") rotateX(90deg)";
    }
    ringEls[i].classList.add(correct ? "is-right" : "is-wrong");
    if (!correct) {
      ringEls[key].classList.add("is-key");
    }
    if (!calm.matches) {
      play(ringEls[i], [
        { transform: ringEls[i].style.transform },
        { transform: ringEls[i].style.transform + " scale(1.12)", offset: 0.35 },
        { transform: ringEls[i].style.transform }
      ], { duration: 420, easing: "ease-out" });
      await wait(260);
    }
  }

  /* ---- shared ---- */
  function score(values) {
    for (const key of Object.keys(values)) {
      const cell = stage.querySelector('[data-sb="' + key + '"]');
      if (cell) {
        cell.textContent = String(values[key]);
      }
    }
  }
  function highlight(name) {
    for (const s of stations) {
      s.classList.toggle("is-hot", s.dataset.station === name);
    }
  }
  function resetBall() {
    cancel([ball, shadow]);
  }

  room.shoot = shoot;
  room.resetBall = resetBall;
  room.loadBall = loadBall;
  room.fire = fire;
  room.runLaps = runLaps;
  room.lapBoard = lapBoard;
  room.resetRunner = resetRunner;
  room.setRings = setRings;
  room.toss = toss;
  room.score = score;
  room.highlight = highlight;
  room.poses = POSES;
  return room;
}
