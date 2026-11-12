// The lunchroom as a CSS 3D room, in the library's construction and light: tall windows throwing
// daylight across a tiled floor, a serving counter under the day's menu, long tables with trays and
// steaming mugs, a lit vending machine, hanging lamps and a clock on real time.
import { px, plane, box, shade, legs } from "./rooms3d.js";
import { BACK, H, group, shell, clock, mountRoom } from "./classroom3d.js";

function windowPair(world, x) {
  const y = -470;
  plane(world, { cls: "c3glow", x: x, y: y, z: BACK + 0.5, w: 560, h: 560 });
  plane(world, { cls: "c3win c3win--tall", x: x, y: y, z: BACK + 1, w: 230, h: 340,
    html: '<span class="c3win__view"></span><span class="c3win__bar c3win__bar--v"></span><span class="c3win__bar c3win__bar--h"></span>' });
  box(world, { cls: "wood", x: x, y: y + 180, z: BACK + 10, w: 260, h: 10, d: 22, faces: "front top" });
  plane(world, { cls: "c3sun", x: x + 120, y: -0.4, z: BACK + 330, w: 380, h: 560, rx: 90, rz: -14 });
}

function counter(world) {
  const x = 380;
  const z = BACK + 70;
  // the menu board above it
  plane(world, { cls: "menu3", x: x, y: -520, z: BACK + 3, w: 420, h: 230,
    html: '<span class="menu3__title">Today</span><span class="menu3__row"><b>Tomato soup</b><i>2.00</i></span>' +
      '<span class="menu3__row"><b>Grilled cheese</b><i>3.50</i></span><span class="menu3__row"><b>Apple slices</b><i>1.00</i></span>' +
      '<span class="menu3__row"><b>Milk or water</b><i>0.50</i></span>' });
  box(world, { cls: "wood wood--dark", x: x, y: -398, z: BACK + 6, w: 440, h: 8, d: 10, faces: "front top" });
  // the counter, its steel top, the food pans and the sneeze guard
  shade(world, { cls: "sh3--strip", x: x + 10, z: z + 70, w: 620, h: 120 });
  box(world, { cls: "wood wood--dark", x: x, y: 0, z: z, w: 560, h: 110, d: 100 });
  plane(world, { cls: "c3panel c3panel--lunch", x: x, y: -56, z: z + 50.6, w: 520, h: 80 });
  box(world, { cls: "steel3", x: x, y: -110, z: z, w: 580, h: 8, d: 112 });
  const pans = ["#C0562F", "#E8C77A", "#8DAA7A", "#E6DBC6", "#A1523E"];
  for (let i = 0; i < pans.length; i = i + 1) {
    box(world, { cls: "food3", x: x - 220 + i * 110, y: -118, z: z - 6, w: 92, h: 10, d: 64, faces: "front top", style: "--c:" + pans[i] });
  }
  plane(world, { cls: "glass3", x: x, y: -170, z: z + 30, w: 560, h: 90, rx: -18 });
  for (const gx of [x - 280, x + 280]) {
    box(world, { cls: "steel3", x: gx, y: -118, z: z + 24, w: 6, h: 96, d: 6, faces: "front right" });
  }
  // a stack of trays at the end
  for (let t = 0; t < 6; t = t + 1) {
    box(world, { cls: "tray3", x: x - 360, y: -t * 5, z: z + 10, w: 90, h: 4, d: 64, faces: "front top" });
  }
}

function vending(world) {
  const x = 785;
  const z = BACK + 70;
  shade(world, { cls: "sh3--deep", x: x + 10, z: z + 80, w: 240, h: 160 });
  plane(world, { cls: "glow3c glow3c--on", x: x, y: -0.8, z: z + 170, w: 340, h: 260, rx: 90 });
  let items = "";
  const colors = ["#C0562F", "#2D4A6E", "#E8C77A", "#4F6B45", "#9B3A28", "#3E5871"];
  for (let r = 0; r < 5; r = r + 1) {
    for (let c = 0; c < 4; c = c + 1) {
      items += '<i style="background:' + colors[(r * 3 + c) % colors.length] + '"></i>';
    }
  }
  box(world, { cls: "vend3", x: x, y: 0, z: z, w: 190, h: 360, d: 110, faces: "front top left",
    html: { front: '<span class="vend3__glass">' + items + '</span><span class="vend3__panel"></span><span class="vend3__slot"></span>' } });
}

// A mug with steam rising from it (the steam is a looping CSS animation of transform and opacity).
function mug(world, x, y, z, color) {
  box(world, { cls: "mug3", x: x, y: y, z: z, w: 26, h: 30, d: 26, style: "--c:" + color });
  plane(world, { cls: "mug3__handle", x: x + 18, y: y - 15, z: z, w: 12, h: 16, style: ";--c:" + color });
  const g = group(world, "steam3", "translate3d(" + px(x) + "," + px(y - 34) + "," + px(z) + ")");
  for (let i = 0; i < 3; i = i + 1) {
    const w = document.createElement("span");
    w.className = "steam3__wisp";
    w.style.animationDelay = (-i * 1.1) + "s";
    w.style.left = (-8 + i * 6) + "px";
    g.appendChild(w);
  }
}

function tables(world) {
  for (const tx of [-330, 230]) {
    const tz = -170;
    const len = 560;
    shade(world, { cls: "sh3--deep", x: tx + 14, z: tz + 20, w: 300, h: len + 80 });
    legs(world, "metal3", tx, tz, 170, len - 40, 96, 8);
    box(world, { cls: "wood wood--warm", x: tx, y: -96, z: tz, w: 190, h: 10, d: len });
    for (const side of [-1, 1]) {
      legs(world, "metal3", tx + side * 140, tz, 44, len - 60, 54, 6);
      box(world, { cls: "wood wood--warm", x: tx + side * 140, y: -54, z: tz, w: 54, h: 8, d: len - 20 });
    }
    // trays with a plate, an apple and a carton; mugs that steam
    for (const p of [[-46, -170], [46, -40], [-46, 90], [46, 200]]) {
      const x = tx + p[0];
      const z = tz + p[1];
      box(world, { cls: "tray3", x: x, y: -106, z: z, w: 76, h: 3, d: 58, faces: "front top" });
      plane(world, { cls: "plate3", x: x - 10, y: -109.6, z: z, w: 36, h: 36, rx: 90 });
      plane(world, { cls: "apple3", x: x - 10, y: -118, z: z, w: 14, h: 14 });
      box(world, { cls: "carton3", x: x + 22, y: -109, z: z - 12, w: 14, h: 22, d: 14, faces: "front top right" });
    }
    mug(world, tx - 10, -106, tz - 100, "#E6DBC6");
    mug(world, tx + 20, -106, tz + 150, "#2D4A6E");
  }
}

function lamps(world) {
  for (const x of [-330, 230]) {
    for (const z of [160]) {
      const drop = 130;
      plane(world, { cls: "cord3", x: x, y: -H + drop / 2, z: z, w: 3, h: drop });
      box(world, { cls: "pendant3 pendant3--lunch", x: x, y: -H + drop + 34, z: z, w: 70, h: 34, d: 70, faces: "front left right bottom" });
      plane(world, { cls: "lamp3__pool lamp3__pool--soft", x: x, y: -106.5, z: z - 260, w: 300, h: 260, rx: 90 });
    }
  }
}

function plant(world) {
  const x = -800;
  const z = -560;
  shade(world, { x: x + 10, z: z + 20, w: 140, h: 100 });
  box(world, { cls: "pot3", x: x, y: 0, z: z, w: 80, h: 70, d: 80 });
  const leaves = [[-30, -60, -40], [24, -70, 30], [0, -96, 4], [36, -40, 58], [-40, -36, -66], [10, -120, -14], [-14, -110, 20]];
  for (const l of leaves) {
    plane(world, { cls: "leaf3", x: x + l[0], y: -70 + l[1], z: z, w: 30, h: 70, rz: l[2] });
  }
}

const POSES = {
  overview: { ox: -170, oy: -330, oz: -260, depth: -460, yaw: 0, pitch: -7 }
};

export function buildLunchroom(stage) {
  return mountRoom(stage, POSES, function (world) {
    shell(world, "lunch");
    windowPair(world, -560);
    windowPair(world, -220);
    clock(world, -10, -560);
    counter(world);
    vending(world);
    tables(world);
    lamps(world);
    plant(world);
    return [];
  }, { minWidth: 1100 });
}
