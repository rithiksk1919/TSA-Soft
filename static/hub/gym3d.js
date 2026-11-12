// The gym as a CSS 3D room, in the library's construction and light: a maple court with painted
// lines, padded walls, high windows, gym lights, bleachers, a ball rack, a scoreboard that keeps the
// game's score, and a hoop the player's ball really flies into (or off).
import { px, plane, box, shade, play } from "./rooms3d.js";
import { BACK, H, shell, mountRoom } from "./classroom3d.js";

const HOOP = { x: 430, rimY: -500, rimZ: BACK + 170 };
const START = { x: 20, y: -24, z: 40 };   // where the player's ball rests (its centre)
const R = 24;                              // the ball's radius

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
  plane(world, { cls: "court3 court3--line", x: -260, y: -0.3, z: -200, w: 5, h: 1400, rx: 90 });
  plane(world, { cls: "court3 court3--circle", x: -260, y: -0.34, z: -100, w: 300, h: 300, rx: 90 });
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
  const net = plane(world, { cls: "net3 net3--big", x: x, y: HOOP.rimY + 34, z: HOOP.rimZ, w: 86, h: 66 });
  return net;
}

function scoreboard(world) {
  box(world, { cls: "sb3", x: -300, y: -470, z: BACK + 14, w: 380, h: 170, d: 24, faces: "front top left right bottom",
    html: { front: '<span class="sb3__face"><span class="sb3__cell"><i>Round</i><b data-sb="round">-</b></span>' +
      '<span class="sb3__cell"><i>Score</i><b data-sb="score">0</b></span><span class="sb3__cell"><i>Streak</i><b data-sb="streak">0</b></span></span>' } });
}

function bleachers(world) {
  // four stepped rows along the left wall, each further back and higher than the one before
  shade(world, { cls: "sh3--deep", x: -660, z: -340, w: 220, h: 700 });
  for (let r = 0; r < 4; r = r + 1) {
    box(world, { cls: "wood wood--warm", x: -620 - r * 56, y: 0, z: -340, w: 56, h: 44 + r * 44, d: 620, faces: "front top right" });
  }
}

function rack(world) {
  const x = 780;
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
  plane(world, { cls: "string3", x: -360, y: -800, z: BACK + 1.2, w: 700, h: 3 });
  for (let i = 0; i < colors.length; i = i + 1) {
    plane(world, { cls: "pennant3", x: -650 + i * 116, y: -778, z: BACK + 1.5, w: 48, h: 46, style: ";--c:" + colors[i] });
  }
}

const POSES = {
  overview: { ox: -220, oy: -360, oz: -240, depth: -440, yaw: 0, pitch: -7 }
};

// Builds the gym and returns the room, plus shoot(made) and score(values).
export function buildGym(stage) {
  let net = null;
  const room = mountRoom(stage, POSES, function (world) {
    shell(world, "gym");
    highWindows(world);
    court(world);
    pennants(world);
    scoreboard(world);
    bleachers(world);
    rack(world);
    lights(world);
    net = hoop(world);
    return [];
  }, { minWidth: 1200 });
  const world = room.world;
  const shadow = shade(world, { cls: "sh3--deep", x: START.x + 6, z: START.z + 4, w: 60, h: 28 });
  const ball = plane(world, { cls: "ball3 ball3--player", x: START.x, y: START.y, z: START.z, w: R * 2, h: R * 2, html: '<span class="ball3__seams"></span>' });

  // The ball's flight, as pieces of parabola sampled into keyframes (transform only).
  function path(made) {
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
      legs3.push({ from: front, to: { x: HOOP.x - 230, y: -R, z: HOOP.rimZ + 360 }, lift: 60, t: 0.75, fall: false });
      legs3.push({ from: { x: HOOP.x - 230, y: -R, z: HOOP.rimZ + 360 }, to: { x: HOOP.x - 330, y: -R, z: HOOP.rimZ + 470 }, lift: 40, t: 0.45 });
      legs3.push({ from: { x: HOOP.x - 330, y: -R, z: HOOP.rimZ + 470 }, to: { x: HOOP.x - 370, y: -R, z: HOOP.rimZ + 520 }, lift: 12, t: 0.3 });
    }
    const total = legs3.reduce(function (a, l) { return a + l.t; }, 0);
    const ballFrames = [];
    const shadowFrames = [];
    let t = 0;
    let netAt = -1;
    let spin = 0;
    for (let i = 0; i < legs3.length; i = i + 1) {
      const l = legs3[i];
      if (l.net) {
        netAt = t / total;
      }
      const n = Math.max(6, Math.round(l.t * 50));
      for (let k = i === 0 ? 0 : 1; k <= n; k = k + 1) {
        const u = k / n;
        const e = l.fall ? u * u : u;
        const x = l.from.x + (l.to.x - l.from.x) * e;
        const z = l.from.z + (l.to.z - l.from.z) * e;
        const y = l.from.y + (l.to.y - l.from.y) * e - l.lift * 4 * u * (1 - u);
        spin = spin + 7;
        const offset = (t + l.t * u) / total;
        ballFrames.push({ offset: offset, transform: "translate3d(" + px(x) + "," + px(y) + "," + px(z) + ") rotateZ(" + spin.toFixed(1) + "deg)" });
        const lift = Math.min(1, (-y - R) / 400);
        shadowFrames.push({ offset: offset, opacity: (1 - lift * 0.85).toFixed(3),
          transform: "translate3d(" + px(x + 6) + ",-0.6px," + px(z + 4) + ") rotateX(90deg) scale(" + (1 - lift * 0.55).toFixed(3) + ")" });
      }
      t = t + l.t;
    }
    return { ball: ballFrames, shadow: shadowFrames, ms: total * 1000, netAt: netAt };
  }

  // Shoots the ball (made or missed); resolves when it has landed. The ball then waits where it
  // stopped until the next round puts it back.
  function shoot(made) {
    const p = path(made);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return Promise.resolve();
    }
    play(shadow, p.shadow, { duration: p.ms, fill: "forwards" });
    if (p.netAt >= 0) {
      const base = net.style.transform;
      play(net, [
        { transform: base, offset: 0 }, { transform: base, offset: p.netAt },
        { transform: base + " scaleY(1.3) translateY(4px)", offset: Math.min(1, p.netAt + 0.05) },
        { transform: base + " scaleY(.9)", offset: Math.min(1, p.netAt + 0.11) },
        { transform: base, offset: Math.min(1, p.netAt + 0.17) }, { transform: base, offset: 1 }
      ], { duration: p.ms });
    }
    return play(ball, p.ball, { duration: p.ms, fill: "forwards" });
  }
  function reset() {
    for (const el of [ball, shadow]) {
      for (const a of el.getAnimations()) {
        a.cancel();
      }
    }
  }
  function score(values) {
    for (const key of Object.keys(values)) {
      const cell = stage.querySelector('[data-sb="' + key + '"]');
      if (cell) {
        cell.textContent = String(values[key]);
      }
    }
  }
  room.shoot = shoot;
  room.resetBall = reset;
  room.score = score;
  return room;
}
