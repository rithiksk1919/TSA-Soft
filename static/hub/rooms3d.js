// The school's four rooms as small CSS 3D scenes, built like the library room: cuboids and planes
// with fixed face shading (tops lit, sides in shade), soft shadows on the floor and pools of lamp
// and window light. Decorative only (aria-hidden); each room's link is the HTML around it.
//
// World units: x right, y down (the floor is y = 0, so heights are negative), z toward the viewer.
// A room is 600 wide and 300 high; its back wall is at z = -220 and its open front at z = 0.

const W = 600;
const H = 300;
const BACK = -220;
const PERSPECTIVE = 900;

function px(n) {
  return (+n).toFixed(1) + "px";
}

function node(cls, style, html) {
  const e = document.createElement("span");
  e.className = cls;
  if (style) {
    e.setAttribute("style", style);
  }
  if (html) {
    e.innerHTML = html;
  }
  return e;
}

function rot(o) {
  let t = "";
  if (o.ry) {
    t += " rotateY(" + o.ry + "deg)";
  }
  if (o.rx) {
    t += " rotateX(" + o.rx + "deg)";
  }
  if (o.rz) {
    t += " rotateZ(" + o.rz + "deg)";
  }
  return t;
}

// A flat plane centred at (x, y, z), w by h.
function plane(parent, o) {
  const e = node("p3 " + (o.cls || ""), "width:" + px(o.w) + ";height:" + px(o.h) + ";left:" + px(-o.w / 2) + ";top:" + px(-o.h / 2) + (o.style || ""), o.html);
  e.style.transform = "translate3d(" + px(o.x || 0) + "," + px(o.y || 0) + "," + px(o.z || 0) + ")" + rot(o);
  parent.appendChild(e);
  return e;
}

// A cuboid whose bottom rests at y, centred on x and z. `faces` lists the faces to draw.
function box(parent, o) {
  const g = node("g3 " + (o.cls || ""), o.style);
  const w = o.w;
  const h = o.h;
  const d = o.d;
  g.style.transform = "translate3d(" + px(o.x) + "," + px((o.y || 0) - h / 2) + "," + px(o.z) + ")" + rot(o);
  const faces = o.faces || "front top left right";
  const html = o.html || {};
  function add(name, fw, fh, tf) {
    if (faces.indexOf(name) < 0) {
      return;
    }
    g.appendChild(node("f3 f3--" + name, "width:" + px(fw) + ";height:" + px(fh) + ";left:" + px(-fw / 2) + ";top:" + px(-fh / 2) + ";transform:" + tf, html[name]));
  }
  add("front", w, h, "translateZ(" + px(d / 2) + ")");
  add("right", d, h, "rotateY(90deg) translateZ(" + px(w / 2) + ")");
  add("left", d, h, "rotateY(-90deg) translateZ(" + px(w / 2) + ")");
  add("top", w, d, "rotateX(90deg) translateZ(" + px(h / 2) + ")");
  add("bottom", w, d, "rotateX(-90deg) translateZ(" + px(h / 2) + ")");
  parent.appendChild(g);
  return g;
}

// A soft shadow (or pool of light) lying on a surface at height y.
function shade(parent, o) {
  let y = -0.6;
  if (o.y !== undefined) {
    y = o.y;
  }
  return plane(parent, { cls: "sh3 " + (o.cls || "sh3--soft"), x: o.x, y: y, z: o.z, w: o.w, h: o.h, rx: 90, rz: o.rz });
}

// Four legs under a top of w by d, inset a little, each h tall.
function legs(parent, cls, x, z, w, d, h, size) {
  const ix = w / 2 - size;
  const iz = d / 2 - size;
  for (const p of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    box(parent, { cls: cls, x: x + p[0] * ix, y: 0, z: z + p[1] * iz, w: size, h: h, d: size, faces: "front left right" });
  }
}

// Floor, back wall, side walls and ceiling.
function shell(world, kind) {
  const depth = -BACK + 160;   // runs out past the open front, under the frame
  plane(world, { cls: "floor3 floor3--" + kind, x: 0, y: 0, z: BACK + depth / 2, w: W, h: depth, rx: 90 });
  plane(world, { cls: "wall3 wall3--back wall3--" + kind, x: 0, y: -H / 2, z: BACK, w: W, h: H });
  plane(world, { cls: "wall3 wall3--side wall3--" + kind, x: -W / 2, y: -H / 2, z: BACK + depth / 2, w: depth, h: H, ry: 90 });
  plane(world, { cls: "wall3 wall3--side wall3--right wall3--" + kind, x: W / 2, y: -H / 2, z: BACK + depth / 2, w: depth, h: H, ry: -90 });
  plane(world, { cls: "ceil3", x: 0, y: -H, z: BACK + depth / 2, w: W, h: depth, rx: -90 });
  // skirting along the back wall
  box(world, { cls: "wood wood--dark", x: 0, y: 0, z: BACK + 2, w: W, h: 10, d: 4, faces: "front top" });
}

// A window on the back wall: a wooden frame, a view out and the patch of daylight it throws.
function windowOnWall(world, x, y, w, h, patch) {
  plane(world, { cls: "win3", x: x, y: y, z: BACK + 1, w: w, h: h, html: '<span class="win3__view"></span><span class="win3__bar win3__bar--v"></span><span class="win3__bar win3__bar--h"></span>' });
  box(world, { cls: "wood", x: x, y: y + h / 2 + 6, z: BACK + 6, w: w + 16, h: 6, d: 12, faces: "front top" });
  if (patch) {
    plane(world, { cls: "sun3", x: patch.x, y: -0.4, z: patch.z, w: patch.w, h: patch.h, rx: 90, rz: patch.rz });
  }
}

function pendant(world, x, z, drop) {
  plane(world, { cls: "cord3", x: x, y: -H + drop / 2, z: z, w: 2, h: drop });
  box(world, { cls: "pendant3", x: x, y: -H + drop + 16, z: z, w: 44, h: 16, d: 44, faces: "front left right bottom" });
}

/* ---- the classroom ---- */
function classroom(world) {
  shell(world, "class");
  windowOnWall(world, 222, -160, 92, 120, { x: 150, z: -96, w: 120, h: 190, rz: -18 });
  // the chalkboard, its frame and chalk ledge
  box(world, { cls: "wood wood--dark", x: -30, y: -78, z: BACK + 5, w: 296, h: 150, d: 10, faces: "front top left right bottom" });
  plane(world, { cls: "chalk3", x: -30, y: -153, z: BACK + 10.6, w: 276, h: 130,
    html: '<span class="chalk3__code">def scope_demo():\n    x = 1\n    return x + y</span><span class="chalk3__mark"></span>' });
  box(world, { cls: "wood", x: -30, y: -78, z: BACK + 15, w: 280, h: 5, d: 12, faces: "front top" });
  box(world, { cls: "chalkstick", x: 60, y: -83, z: BACK + 15, w: 14, h: 3, d: 3, faces: "front top" });
  // the teacher's desk, with a stack of books and an apple
  shade(world, { cls: "sh3--deep", x: -206, z: -150, w: 170, h: 100 });
  box(world, { cls: "wood wood--warm", x: -210, y: 0, z: -156, w: 120, h: 62, d: 54, faces: "front top left right" });
  box(world, { cls: "wood wood--dark", x: -210, y: -62, z: -156, w: 132, h: 7, d: 62 });
  box(world, { cls: "book3", x: -236, y: -69, z: -160, w: 34, h: 6, d: 24, style: "--c:#2D4A6E" });
  box(world, { cls: "book3", x: -234, y: -75, z: -160, w: 30, h: 5, d: 22, style: "--c:#7B3F36" });
  plane(world, { cls: "apple3", x: -186, y: -76, z: -150, w: 14, h: 14 });
  // two rows of student desks, each with a chair behind it
  for (const z of [-118, -40]) {
    for (const x of [-40, 120]) {
      shade(world, { x: x + 6, z: z + 18, w: 120, h: 100 });
      legs(world, "metal3", x, z, 86, 46, 50, 4);
      box(world, { cls: "wood wood--warm", x: x, y: -50, z: z, w: 92, h: 6, d: 50 });
      box(world, { cls: "paper3", x: x - 10, y: -56, z: z + 4, w: 30, h: 1, d: 22, faces: "top" });
      // the chair
      legs(world, "metal3", x, z + 38, 34, 30, 30, 3);
      box(world, { cls: "wood wood--warm", x: x, y: -30, z: z + 38, w: 40, h: 4, d: 34 });
      box(world, { cls: "wood wood--warm", x: x, y: -34, z: z + 56, w: 40, h: 30, d: 4, faces: "front top left right" });
    }
  }
}

/* ---- the library ---- */
const BOOK_COLORS = ["#7B3F36", "#2D4A6E", "#B8964A", "#4F6B45", "#8A6446", "#3E5871", "#A1523E", "#5B4A6B"];

function library(world) {
  shell(world, "lib");
  windowOnWall(world, -150, -170, 104, 104, { x: -100, z: -110, w: 120, h: 170, rz: 16 });
  // the bookcase
  const cx = 168;
  const cz = BACK + 26;
  const cw = 210;
  const ch = 236;
  const cd = 46;
  shade(world, { cls: "sh3--strip", x: cx + 4, z: cz + 34, w: cw + 50, h: 60 });
  plane(world, { cls: "case3__back", x: cx, y: -ch / 2, z: cz - cd / 2 + 1, w: cw, h: ch });
  box(world, { cls: "wood wood--dark", x: cx - cw / 2 + 5, y: 0, z: cz, w: 10, h: ch, d: cd, faces: "front left right" });
  box(world, { cls: "wood wood--dark", x: cx + cw / 2 - 5, y: 0, z: cz, w: 10, h: ch, d: cd, faces: "front left right" });
  box(world, { cls: "wood wood--dark", x: cx, y: -ch, z: cz, w: cw + 8, h: 8, d: cd + 6, faces: "front top left right" });
  let seed = 11;
  function rnd() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  const shelves = [0, -76, -152];
  for (let s = 0; s < shelves.length; s = s + 1) {
    const sy = shelves[s];
    box(world, { cls: "wood", x: cx, y: sy, z: cz, w: cw - 20, h: 8, d: cd - 2, faces: "front top" });
    let bx = cx - cw / 2 + 14;
    const end = cx + cw / 2 - 14;
    while (bx < end - 10) {
      const bw = 9 + Math.round(rnd() * 7);
      const bh = 44 + Math.round(rnd() * 20);
      const lean = rnd() < 0.08 ? 8 : 0;
      const color = BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)];
      box(world, { cls: "book3", x: bx + bw / 2, y: sy - 8, z: cz + 2, w: bw, h: bh, d: 30, rz: lean, faces: "front top right", style: "--c:" + color });
      bx = bx + bw + 1 + (lean ? 5 : 0);
    }
  }
  // a rug, the reading desk and its lamp
  plane(world, { cls: "rug3", x: -70, y: -0.3, z: -84, w: 250, h: 150, rx: 90 });
  shade(world, { cls: "sh3--deep", x: -60, z: -76, w: 220, h: 120 });
  legs(world, "wood wood--warm", -70, -90, 160, 70, 64, 7);
  box(world, { cls: "wood wood--warm", x: -70, y: -64, z: -90, w: 170, h: 7, d: 76 });
  plane(world, { cls: "lamp3__pool", x: -94, y: -71.6, z: -96, w: 150, h: 90, rx: 90 });
  box(world, { cls: "book3 book3--open", x: -100, y: -71, z: -82, w: 54, h: 2, d: 34, faces: "front top", style: "--c:#FBF8F1" });
  box(world, { cls: "brass", x: -12, y: -71, z: -108, w: 20, h: 4, d: 16 });
  box(world, { cls: "brass", x: -12, y: -75, z: -108, w: 3, h: 44, d: 3, faces: "front right" });
  box(world, { cls: "lamp3", x: -28, y: -112, z: -104, w: 40, h: 16, d: 26, rz: 14, faces: "front left right top bottom" });
  // a chair pulled up to the desk
  legs(world, "wood wood--dark", -70, -30, 40, 34, 34, 4);
  box(world, { cls: "wood wood--dark", x: -70, y: -34, z: -30, w: 46, h: 5, d: 38 });
}

/* ---- the gym ---- */
function gym(world) {
  shell(world, "gym");
  // padded mats along the bottom of the back wall, and pennants above
  box(world, { cls: "mat3", x: -40, y: 0, z: BACK + 6, w: 500, h: 60, d: 10, faces: "front top" });
  const flags = ["#4F6B45", "#B8964A", "#9B3A28", "#2D4A6E"];
  for (let i = 0; i < flags.length; i = i + 1) {
    plane(world, { cls: "pennant3", x: -70 + i * 62, y: -236, z: BACK + 1.5, w: 40, h: 44, style: ";--c:" + flags[i] });
  }
  plane(world, { cls: "string3", x: 20, y: -258, z: BACK + 1.2, w: 260, h: 2 });
  // court lines
  plane(world, { cls: "court3 court3--line", x: -20, y: -0.3, z: -100, w: 3, h: 240, rx: 90 });
  plane(world, { cls: "court3 court3--circle", x: -20, y: -0.35, z: -90, w: 130, h: 130, rx: 90 });
  // bleachers: three stepped rows on the left
  for (let r = 0; r < 3; r = r + 1) {
    box(world, { cls: "wood wood--warm", x: -222, y: 0, z: BACK + 30 + (2 - r) * 34, w: 130, h: 24 + r * 24, d: 34 });
  }
  shade(world, { cls: "sh3--strip", x: -218, z: -86, w: 170, h: 50 });
  // the hoop: pole, arm, backboard, rim and net
  const hx = 214;
  shade(world, { x: hx + 18, z: BACK + 36, w: 70, h: 40 });
  box(world, { cls: "metal3 metal3--dark", x: hx + 30, y: 0, z: BACK + 26, w: 10, h: 236, d: 10, faces: "front left right" });
  box(world, { cls: "metal3 metal3--dark", x: hx + 30, y: -226, z: BACK + 46, w: 8, h: 8, d: 44, faces: "front left right top bottom" });
  box(world, { cls: "board3", x: hx, y: -170, z: BACK + 70, w: 120, h: 80, d: 5, faces: "front top left right bottom",
    html: { front: '<span class="board3__square"></span>' } });
  plane(world, { cls: "rim3", x: hx, y: -176, z: BACK + 92, w: 44, h: 44, rx: 90 });
  plane(world, { cls: "net3", x: hx, y: -160, z: BACK + 104, w: 40, h: 32 });
  // a ball resting on the court, and its shadow
  shade(world, { cls: "sh3--deep", x: 70, z: -36, w: 46, h: 22 });
  plane(world, { cls: "ball3", x: 64, y: -15, z: -40, w: 30, h: 30, html: '<span class="ball3__seams"></span>' });
}

/* ---- the lunchroom ---- */
function lunchroom(world) {
  shell(world, "lunch");
  // the clock
  plane(world, { cls: "clock3", x: 70, y: -222, z: BACK + 2, w: 62, h: 62,
    html: '<span class="clock3__h" style="transform:rotate(-30deg)"></span><span class="clock3__m" style="transform:rotate(120deg)"></span><span class="clock3__pin"></span>' });
  // the serving counter, with trays and food on it
  shade(world, { cls: "sh3--strip", x: -132, z: BACK + 56, w: 280, h: 60 });
  box(world, { cls: "wood wood--dark", x: -140, y: 0, z: BACK + 30, w: 260, h: 74, d: 52 });
  box(world, { cls: "steel3", x: -140, y: -74, z: BACK + 30, w: 268, h: 6, d: 58 });
  const items = [["#A9C7D6", -230], ["#E8C77A", -184], ["#9B3A28", -138], ["#8DAA7A", -92], ["#E8C77A", -46]];
  for (const it of items) {
    box(world, { cls: "food3", x: it[1], y: -80, z: BACK + 30, w: 34, h: 12, d: 30, style: "--c:" + it[0] });
  }
  // the long table and its two benches
  const tx = 70;
  const tz = -96;
  shade(world, { cls: "sh3--deep", x: tx + 8, z: tz + 10, w: 330, h: 160 });
  legs(world, "metal3", tx, tz, 270, 70, 54, 6);
  box(world, { cls: "wood wood--warm", x: tx, y: -54, z: tz, w: 290, h: 7, d: 76 });
  for (const bz of [tz - 60, tz + 60]) {
    legs(world, "metal3", tx, bz, 250, 18, 30, 4);
    box(world, { cls: "wood wood--warm", x: tx, y: -30, z: bz, w: 270, h: 5, d: 22 });
  }
  // trays with a plate, a carton and an apple
  for (const p of [[-20, -16], [70, 14], [160, -16]]) {
    const x = tx + p[0] - 70;
    const z = tz + p[1];
    box(world, { cls: "tray3", x: x, y: -61, z: z, w: 56, h: 2, d: 38, faces: "front top" });
    plane(world, { cls: "plate3", x: x - 10, y: -63.4, z: z, w: 24, h: 24, rx: 90 });
    box(world, { cls: "carton3", x: x + 16, y: -63, z: z - 6, w: 10, h: 16, d: 10, faces: "front top right" });
  }
  // pendant lamps over the table, and their light on it
  for (const x of [tx - 80, tx + 80]) {
    pendant(world, x, tz, 120);
    plane(world, { cls: "lamp3__pool lamp3__pool--soft", x: x, y: -61.2, z: tz, w: 200, h: 120, rx: 90 });
  }
}

const BUILDERS = { classroom: classroom, library: library, gym: gym, lunch: lunchroom };

// Builds every [data-scene] stage under `root`, fits each to its room and lets the camera lean
// toward the pointer while it is over that room.
export function mountRooms(root) {
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stages = root.querySelectorAll(".stage3[data-scene]");
  const cams = [];
  for (const stage of stages) {
    const build = BUILDERS[stage.dataset.scene];
    if (!build) {
      continue;
    }
    const cam = node("cam3");
    const world = node("world3");
    cam.appendChild(world);
    stage.appendChild(cam);
    build(world);
    const state = { stage: stage, cam: cam, k: 1, yaw: 0, pitch: 0, dolly: 0, ty: 0, tp: 0, td: 0, frame: 0 };
    cams.push(state);
    const room = stage.closest(".room");
    if (room) {
      room.addEventListener("pointermove", function (event) {
        if (calm.matches || event.pointerType !== "mouse") {
          return;
        }
        const r = room.getBoundingClientRect();
        state.ty = ((event.clientX - r.left) / r.width - 0.5) * 10;
        state.tp = ((event.clientY - r.top) / r.height - 0.5) * -3;
        state.td = 60;
        run(state);
      });
      room.addEventListener("pointerleave", function () {
        state.ty = 0;
        state.tp = 0;
        state.td = 0;
        run(state);
      });
      room.addEventListener("focus", function () {
        if (!calm.matches) {
          state.td = 60;
          run(state);
        }
      });
      room.addEventListener("blur", function () {
        state.td = 0;
        run(state);
      });
    }
  }
  function pose(s) {
    // Turn about the middle of the room, not its open front.
    const mid = BACK / 2;
    s.cam.style.transform = "scale3d(" + s.k.toFixed(4) + "," + s.k.toFixed(4) + "," + s.k.toFixed(4) + ") translateZ(" + px(mid) + ") rotateX(" + s.pitch.toFixed(3) + "deg) rotateY(" + s.yaw.toFixed(3) + "deg) translateZ(" + px(-mid + s.dolly) + ")";
  }
  function step(s) {
    s.yaw = s.yaw + (s.ty - s.yaw) * 0.12;
    s.pitch = s.pitch + (s.tp - s.pitch) * 0.12;
    s.dolly = s.dolly + (s.td - s.dolly) * 0.12;
    pose(s);
    if (Math.abs(s.ty - s.yaw) + Math.abs(s.tp - s.pitch) + Math.abs(s.td - s.dolly) > 0.02) {
      s.frame = requestAnimationFrame(function () {
        step(s);
      });
    } else {
      s.frame = 0;
    }
  }
  function run(s) {
    if (!s.frame) {
      s.frame = requestAnimationFrame(function () {
        step(s);
      });
    }
  }
  function fit() {
    for (const s of cams) {
      const w = s.stage.clientWidth;
      if (!w) {
        continue;
      }
      // A slightly wider view than the room, so the side walls show; the perspective scales with
      // the room so every size sees the same picture.
      s.k = w / (W * 0.94);
      s.stage.style.perspective = px(PERSPECTIVE * s.k);
      pose(s);
    }
  }
  fit();
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fit);
    for (const s of cams) {
      ro.observe(s.stage);
    }
  } else {
    window.addEventListener("resize", fit);
  }
}
