// The classroom as a CSS 3D room, built and lit like the library: cuboids and planes with fixed face
// shading, soft shadows, daylight from the window and pools of lamp light. The lesson's own code is
// written on the chalkboard and its subject on the textbook's cover, so a new lesson file changes the
// room. Clicking a station (or its button in the bar) flies the camera to it.
//
// World units: x right, y down (the floor is y = 0), z toward the viewer. The room is 1800 wide and
// 820 high; the back wall is at z = -700.
import { px, node, plane, box, shade, legs } from "./rooms3d.js";

export const W = 1800;
export const H = 820;
export const BACK = -700;
export const FRONT = 700;
const P = 1500;            // perspective, in world units

function esc(text) {
  return String(text).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// A big surface as a grid of tiles: one huge plane, magnified, can drop out of the compositor.
export function tiled(parent, o, cols, rows) {
  const g = node("g3");
  let t = "translate3d(" + px(o.x || 0) + "," + px(o.y || 0) + "," + px(o.z || 0) + ")";
  if (o.ry) {
    t += " rotateY(" + o.ry + "deg)";
  }
  if (o.rx) {
    t += " rotateX(" + o.rx + "deg)";
  }
  g.style.transform = t;
  parent.appendChild(g);
  const tw = o.w / cols;
  const th = o.h / rows;
  for (let r = 0; r < rows; r = r + 1) {
    for (let c = 0; c < cols; c = c + 1) {
      g.appendChild(node("p3 " + o.cls, "width:" + px(tw + 1) + ";height:" + px(th + 1) + ";left:" + px(-o.w / 2 + c * tw) + ";top:" + px(-o.h / 2 + r * th) +
        ";background-size:" + px(o.w) + " " + px(o.h) + ";background-position:" + px(-c * tw) + " " + px(-r * th)));
    }
  }
  return g;
}

export function group(parent, cls, transform, attrs) {
  const g = node("g3 " + (cls || ""));
  if (transform) {
    g.style.transform = transform;
  }
  if (attrs) {
    for (const k of Object.keys(attrs)) {
      g.setAttribute(k, attrs[k]);
    }
  }
  parent.appendChild(g);
  return g;
}

// A station's plaque: brass-edged, standing on two posts (or hanging on two chains).
export function plaque(parent, o) {
  const g = group(parent, "sign3c", "translate3d(" + px(o.x) + "," + px(o.y) + "," + px(o.z) + ")");
  if (o.hang) {
    for (const x of [-120, 120]) {
      plane(g, { cls: "chain3", x: x, y: -o.hang / 2 - 42, z: -2, w: 3, h: o.hang });
    }
  } else {
    for (const x of [-100, 100]) {
      box(g, { cls: "brass brass--dark", x: x, y: 0, z: -4, w: 6, h: o.post || 110, d: 6, faces: "front right" });
    }
  }
  const y = o.hang ? 0 : -(o.post || 110) - 42;
  plane(g, { cls: "plaque3", x: 0, y: y, z: 0, w: 300, h: 84,
    html: '<span class="plaque3__verb">' + esc(o.verb) + '</span><span class="plaque3__name">' + esc(o.name) + "</span>" });
  return g;
}

export function shell(world, kind) {
  const k = kind ? " c3--" + kind : "";
  const depth = FRONT - BACK;
  tiled(world, { cls: "c3floor" + k, x: 0, y: 0, z: (BACK + FRONT) / 2, w: W, h: depth, rx: 90 }, 4, 4);
  tiled(world, { cls: "c3wall c3wall--back" + k, x: 0, y: -H / 2, z: BACK, w: W, h: H }, 4, 2);
  tiled(world, { cls: "c3wall c3wall--left" + k, x: -W / 2, y: -H / 2, z: (BACK + FRONT) / 2, w: depth, h: H, ry: 90 }, 4, 2);
  tiled(world, { cls: "c3wall c3wall--right" + k, x: W / 2, y: -H / 2, z: (BACK + FRONT) / 2, w: depth, h: H, ry: -90 }, 4, 2);
  tiled(world, { cls: "c3ceil" + k, x: 0, y: -H, z: (BACK + FRONT) / 2, w: W, h: depth, rx: -90 }, 4, 4);
  // wainscot, rail and skirting along the back wall
  plane(world, { cls: "c3wainscot" + k, x: 0, y: -70, z: BACK + 1, w: W, h: 140 });
  box(world, { cls: "wood wood--dark", x: 0, y: -140, z: BACK + 4, w: W, h: 8, d: 8, faces: "front top" });
  box(world, { cls: "wood wood--dark", x: 0, y: 0, z: BACK + 4, w: W, h: 14, d: 8, faces: "front top" });
  for (const side of [-1, 1]) {
    plane(world, { cls: "c3wainscot c3wainscot--side" + k, x: side * (W / 2 - 1), y: -70, z: (BACK + FRONT) / 2, w: depth, h: 140, ry: side * -90 });
  }
}

function windowAndLight(world) {
  const x = -600;
  const y = -470;
  plane(world, { cls: "c3glow", x: x, y: y, z: BACK + 0.5, w: 620, h: 620 });
  plane(world, { cls: "c3win", x: x, y: y, z: BACK + 1, w: 250, h: 330,
    html: '<span class="c3win__view"></span><span class="c3win__bar c3win__bar--v"></span><span class="c3win__bar c3win__bar--h"></span>' });
  box(world, { cls: "wood", x: x, y: y + 165 + 10, z: BACK + 10, w: 280, h: 10, d: 22, faces: "front top" });
  // the daylight it throws forward across the floor
  plane(world, { cls: "c3sun", x: x + 150, y: -0.4, z: BACK + 300, w: 420, h: 520, rx: 90, rz: -16 });
  // a plant on the sill
  box(world, { cls: "pot3", x: x - 80, y: y + 165, z: BACK + 14, w: 34, h: 30, d: 26 });
  for (const leaf of [[-14, -24, -30], [10, -30, 24], [-2, -40, 4], [18, -20, 50], [-20, -16, -60]]) {
    plane(world, { cls: "leaf3", x: x - 80 + leaf[0], y: y + 165 - 30 + leaf[1], z: BACK + 16, w: 16, h: 34, rz: leaf[2] });
  }
}

function chalkboard(world, lesson, look) {
  const g = group(world, "station3c", "", { "data-station": "watch" });
  box(g, { cls: "wood wood--dark", x: 0, y: -250, z: BACK + 8, w: 840, h: 410, d: 14, faces: "front top left right bottom" });
  const lines = lesson.chalkboard.code;
  let code = "";
  for (let i = 0; i < lines.length && i < 10; i = i + 1) {
    code += '<span class="c3board__line"><b>' + (i + 1) + "</b>" + esc(lines[i]) + "</span>";
  }
  plane(g, { cls: "c3board", x: 0, y: -455, z: BACK + 15.2, w: 800, h: 370,
    html: '<span class="c3board__title">' + esc(lesson.chalkboard.title) + '</span><span class="c3board__code">' + code + "</span>" });
  box(g, { cls: "wood", x: 0, y: -250, z: BACK + 24, w: 820, h: 8, d: 22, faces: "front top" });
  box(g, { cls: "chalkstick", x: 180, y: -258, z: BACK + 24, w: 30, h: 5, d: 5, faces: "front top" });
  box(g, { cls: "chalkstick chalkstick--y", x: 226, y: -258, z: BACK + 22, w: 22, h: 5, d: 5, faces: "front top" });
  box(g, { cls: "eraser3", x: -240, y: -258, z: BACK + 24, w: 60, h: 14, d: 18 });
  plaque(g, { x: 0, y: -730, z: BACK + 14, verb: "Watch", name: "The chalkboard", hang: 46 });
  shade(g, { cls: "glow3c", x: 0, y: -0.7, z: BACK + 160, w: 900, h: 300 });
  return g;
}

export function clock(world, x, y) {
  x = x === undefined ? 640 : x;
  y = y === undefined ? -560 : y;
  plane(world, { cls: "c3clock", x: x, y: y, z: BACK + 2, w: 120, h: 120,
    html: '<span class="c3clock__h"></span><span class="c3clock__m"></span><span class="c3clock__s"></span><span class="c3clock__pin"></span>' });
}

function teacherDesk(world, lesson, look) {
  const g = group(world, "station3c", "", { "data-station": "read" });
  const x = 560;
  const z = -330;
  shade(world, { cls: "sh3--deep", x: x + 20, z: z + 40, w: 420, h: 250 });
  box(g, { cls: "wood wood--warm", x: x, y: 0, z: z, w: 300, h: 150, d: 130, faces: "front top left right" });
  plane(g, { cls: "c3panel", x: x, y: -80, z: z + 65.6, w: 250, h: 110 });
  box(g, { cls: "wood wood--dark", x: x, y: -150, z: z, w: 330, h: 12, d: 150 });
  // the textbook: subject and title on its cover
  const cover = '<span class="c3cover__subject">' + esc(look.subject) + '</span><span class="c3cover__title">' + esc(lesson.title || lesson.skill_name) + "</span>";
  shade(g, { cls: "sh3--soft", x: x - 34, y: -162.4, z: z + 6, w: 150, h: 190 });
  box(g, { cls: "book3c", x: x - 40, y: -162, z: z, w: 120, h: 24, d: 160, ry: -8, style: "--c:" + look.color,
    faces: "front top left right", html: { top: cover, front: '<span class="c3pages"></span>' } });
  // a lamp on the desk and its light
  plane(g, { cls: "lamp3__pool", x: x + 40, y: -162.5, z: z + 4, w: 320, h: 230, rx: 90 });
  box(g, { cls: "brass", x: x + 140, y: -162, z: z - 30, w: 34, h: 6, d: 26 });
  box(g, { cls: "brass", x: x + 140, y: -168, z: z - 30, w: 5, h: 70, d: 5, faces: "front right" });
  box(g, { cls: "lamp3", x: x + 118, y: -232, z: z - 24, w: 70, h: 26, d: 40, rz: 18, faces: "front left right top bottom" });
  // an apple and a cup of pencils
  plane(g, { cls: "apple3", x: x + 30, y: -175, z: z + 40, w: 24, h: 24 });
  box(g, { cls: "cup3", x: x - 120, y: -162, z: z - 30, w: 26, h: 32, d: 26 });
  plaque(g, { x: x - 30, y: -162, z: z - 66, verb: "Read", name: "The textbook", post: 120 });
  shade(g, { cls: "glow3c", x: x, y: -0.7, z: z + 40, w: 600, h: 420 });
  return g;
}

function listeningDesk(world) {
  const g = group(world, "station3c", "", { "data-station": "listen" });
  const x = -560;
  const z = -250;
  shade(world, { cls: "sh3--deep", x: x + 16, z: z + 30, w: 400, h: 230 });
  legs(g, "wood wood--warm", x, z, 300, 130, 130, 12);
  box(g, { cls: "wood wood--warm", x: x, y: -130, z: z, w: 320, h: 12, d: 146 });
  // a small radio with a speaker grille and a dial
  box(g, { cls: "radio3", x: x + 80, y: -142, z: z - 26, w: 120, h: 74, d: 54,
    html: { front: '<span class="radio3__grille"></span><span class="radio3__dial"></span><span class="radio3__knob"></span>' } });
  // headphones resting on the desk
  const hx = x - 70;
  const hy = -142;
  box(g, { cls: "phones3", x: hx - 38, y: hy, z: z + 10, w: 18, h: 40, d: 34 });
  box(g, { cls: "phones3", x: hx + 38, y: hy, z: z + 10, w: 18, h: 40, d: 34 });
  plane(g, { cls: "band3", x: hx, y: hy - 58, z: z + 10, w: 94, h: 70 });
  plane(g, { cls: "cable3", x: (hx + x + 80) / 2 - 10, y: hy - 1, z: z + 30, w: 120, h: 3, rx: 90, rz: -12 });
  // the chair
  legs(g, "wood wood--dark", x, z + 120, 90, 80, 80, 8);
  box(g, { cls: "wood wood--dark", x: x, y: -80, z: z + 120, w: 100, h: 10, d: 90 });
  box(g, { cls: "wood wood--dark", x: x, y: -90, z: z + 160, w: 100, h: 80, d: 8, faces: "front top left right" });
  plaque(g, { x: x, y: -142, z: z - 64, verb: "Listen", name: "The listening desk", post: 130 });
  shade(g, { cls: "glow3c", x: x, y: -0.7, z: z + 40, w: 560, h: 420 });
  return g;
}

function studentDesks(world) {
  for (const z of [-90, 110]) {
    for (const x of [-230, 0, 230]) {
      shade(world, { x: x + 10, z: z + 30, w: 220, h: 170 });
      legs(world, "metal3", x, z, 140, 76, 110, 6);
      box(world, { cls: "wood wood--warm", x: x, y: -110, z: z, w: 150, h: 9, d: 84 });
      box(world, { cls: "paper3", x: x - 20, y: -119, z: z + 6, w: 50, h: 1, d: 36, faces: "top" });
      legs(world, "metal3", x, z + 76, 66, 60, 64, 5);
      box(world, { cls: "wood wood--warm", x: x, y: -64, z: z + 76, w: 74, h: 7, d: 66 });
      box(world, { cls: "wood wood--warm", x: x, y: -71, z: z + 108, w: 74, h: 56, d: 7, faces: "front top left right" });
    }
  }
}

function pendants(world) {
  for (const x of [-430, 430]) {
    const z = 90;
    const drop = 150;
    plane(world, { cls: "cord3", x: x, y: -H + drop / 2, z: z, w: 3, h: drop });
    box(world, { cls: "pendant3", x: x, y: -H + drop + 30, z: z, w: 80, h: 30, d: 80, faces: "front left right bottom" });
    plane(world, { cls: "c3pool", x: x, y: -0.5, z: z, w: 640, h: 520, rx: 90 });
  }
}

const POSES = {
  overview: { ox: 0, oy: -330, oz: -260, depth: -460, yaw: 0, pitch: -7 },
  watch: { ox: 0, oy: -460, oz: BACK + 15, depth: 560, yaw: 0, pitch: -2 },
  read: { ox: 520, oy: -200, oz: -330, depth: 760, yaw: -6, pitch: -24 },
  listen: { ox: -560, oy: -190, oz: -250, depth: 720, yaw: 6, pitch: -20 }
};

// Builds the classroom into `stage` and returns its camera controls.
export function buildClassroom(stage, lesson, look) {
  return mountRoom(stage, POSES, function (world) {
    shell(world);
    windowAndLight(world);
    clock(world);
    pendants(world);
    studentDesks(world);
    return [chalkboard(world, lesson, look), teacherDesk(world, lesson, look), listeningDesk(world)];
  });
}

// A room in a stage: builds it with `build(world)` (which returns its clickable stations), fits it
// to the stage, keeps any wall clock on real time, warms a station on hover, leans the camera toward
// the pointer in the overview and flies the camera between `poses` (transform only, one rAF loop).
// opts.fit(w, h) can choose the scale; opts.minWidth keeps that many world units in view.
export function mountRoom(stage, poses, build, opts) {
  opts = opts || {};
  const cam = node("cam3 c3cam");
  const world = node("world3");
  cam.appendChild(world);
  stage.appendChild(cam);
  const stations = build(world) || [];
  const POSES = poses;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  let k = 1;
  let pose = Object.assign({}, POSES.overview);
  let look3 = { yaw: 0, pitch: 0, ty: 0, tp: 0, frame: 0 };
  let at = "overview";
  let flight = 0;

  function render() {
    const yaw = pose.yaw + look3.yaw;
    const pitch = pose.pitch + look3.pitch;
    cam.style.transform = "scale3d(" + k.toFixed(4) + "," + k.toFixed(4) + "," + k.toFixed(4) + ") translateZ(" + px(pose.depth) + ") rotateX(" + pitch.toFixed(3) +
      "deg) rotateY(" + yaw.toFixed(3) + "deg) translate3d(" + px(-pose.ox) + "," + px(-pose.oy) + "," + px(-pose.oz) + ")";
  }
  function fit() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    // Fill the screen; on a tall, narrow one keep at least the room's middle in view.
    k = Math.max(w / 1750, Math.min(h / 1000, Math.max(w / (opts.minWidth || 900), h / 1300)));
    stage.style.perspective = px(P * k);
    render();
  }

  // The camera eases from where it is to a station's pose (transform only, one rAF loop).
  function fly(name) {
    const to = POSES[name];
    at = name;
    cancelAnimationFrame(flight);
    look3.ty = 0;
    look3.tp = 0;
    if (calm.matches) {
      pose = Object.assign({}, to);
      look3.yaw = 0;
      look3.pitch = 0;
      render();
      return Promise.resolve();
    }
    const from = Object.assign({}, pose);
    const ly = look3.yaw;
    const lp = look3.pitch;
    const ms = 900;
    const t0 = performance.now();
    return new Promise(function (resolve) {
      function tick(now) {
        const u = Math.min(1, (now - t0) / ms);
        const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        for (const key of Object.keys(to)) {
          pose[key] = from[key] + (to[key] - from[key]) * e;
        }
        look3.yaw = ly * (1 - e);
        look3.pitch = lp * (1 - e);
        render();
        if (u < 1) {
          flight = requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      flight = requestAnimationFrame(tick);
    });
  }

  // In the overview the camera leans a little toward the pointer.
  function lookTick() {
    const rate = look3.rate || 0.08;
    look3.yaw = look3.yaw + (look3.ty - look3.yaw) * rate;
    look3.pitch = look3.pitch + (look3.tp - look3.pitch) * rate;
    render();
    if (Math.abs(look3.ty - look3.yaw) + Math.abs(look3.tp - look3.pitch) > 0.01) {
      look3.frame = requestAnimationFrame(lookTick);
    } else {
      look3.frame = 0;
    }
  }
  stage.addEventListener("pointermove", function (event) {
    if (at !== "overview" || calm.matches || event.pointerType !== "mouse") {
      return;
    }
    const r = stage.getBoundingClientRect();
    look3.rate = 0.08;
    look3.ty = ((event.clientX - r.left) / r.width - 0.5) * 5;
    look3.tp = ((event.clientY - r.top) / r.height - 0.5) * -2.5;
    if (!look3.frame) {
      look3.frame = requestAnimationFrame(lookTick);
    }
  });

  // Hovering a station warms its light and lifts its plaque.
  for (const s of stations) {
    s.addEventListener("pointerenter", function () {
      if (at === "overview") {
        s.classList.add("is-hot");
      }
    });
    s.addEventListener("pointerleave", function () {
      s.classList.remove("is-hot");
    });
  }

  // The clock keeps the real time; its second hand sweeps (a CSS animation from the current second).
  const now = new Date();
  for (const hands of stage.querySelectorAll(".c3clock")) {
  hands.querySelector(".c3clock__h").style.transform = "rotate(" + ((now.getHours() % 12) * 30 + now.getMinutes() * 0.5) + "deg)";
  hands.querySelector(".c3clock__m").style.transform = "rotate(" + (now.getMinutes() * 6 + now.getSeconds() * 0.1) + "deg)";
  hands.querySelector(".c3clock__s").style.animationDelay = "-" + now.getSeconds() + "s";
  }

  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(stage);

  return {
    world: world,
    fly: fly,
    // Turns the overview camera a little (eased), for an idle drift.
    lean: function (yaw, pitch, rate) {
      if (at !== "overview" || calm.matches) {
        return;
      }
      look3.rate = rate || 0.08;
      look3.ty = yaw;
      look3.tp = pitch;
      if (!look3.frame) {
        look3.frame = requestAnimationFrame(lookTick);
      }
    },
    at: function () {
      return at;
    },
    clearHot: function () {
      for (const s of stations) {
        s.classList.remove("is-hot");
      }
    },
    destroy: function () {
      ro.disconnect();
      cancelAnimationFrame(flight);
      cancelAnimationFrame(look3.frame);
    }
  };
}
