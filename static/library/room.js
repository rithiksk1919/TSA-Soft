/* SkillBridge: the library, a CSS 3D room and the home screen.
   A camera looks into one room: bookcase (Learn), reading desk (Apply), card catalog (Practice).
   Clicking a station flies the camera to it (camera spring), then hands off to its close-up scene.
   Built from planes and cuboids with fixed face shading; no WebGL, no libraries.
   Deep links #shelf and #practice skip the room. */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, $ = ui.$, $$ = ui.$$, lerp = ui.lerp;

  var room = $("#room"), cam = $("#cam3"), world = $("#world3");
  var link = $("#to-room");

  /* =====================================================================
     Builders: planes and cuboids in world space (x right, y down, z toward the viewer)
     ===================================================================== */

  function node(cls, style, html) {
    var e = document.createElement("span");
    e.className = cls;
    if (style) e.setAttribute("style", style);
    if (html) e.innerHTML = html;
    return e;
  }
  function px(n) { return (+n).toFixed(1) + "px"; }

  // A flat plane centred at (x, y, z), w x h, with optional rotations.
  function plane(parent, o) {
    var e = node("p3 " + (o.cls || ""), "width:" + px(o.w) + ";height:" + px(o.h) + ";left:" + px(-o.w / 2) + ";top:" + px(-o.h / 2), o.html);
    e.style.transform = "translate3d(" + px(o.x || 0) + "," + px(o.y || 0) + "," + px(o.z || 0) + ")" +
      (o.ry ? " rotateY(" + o.ry + "deg)" : "") + (o.rx ? " rotateX(" + o.rx + "deg)" : "") + (o.rz ? " rotateZ(" + o.rz + "deg)" : "");
    parent.appendChild(e);
    return e;
  }

  // A large surface as a grid of tiles in its own group. One huge plane, magnified on a wide screen,
  // can exceed what the compositor will draw and drop out as a black hole; tiles keep layers small.
  function tiled(parent, o, cols, rows) {
    var g = node("g3 " + (o.gcls || ""));
    g.style.transform = "translate3d(" + px(o.x || 0) + "," + px(o.y || 0) + "," + px(o.z || 0) + ")" +
      (o.ry ? " rotateY(" + o.ry + "deg)" : "") + (o.rx ? " rotateX(" + o.rx + "deg)" : "");
    parent.appendChild(g);
    var tw = o.w / cols, th = o.h / rows;
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var ox = c * tw, oy = r * th;
      var e = node("p3 " + (o.cls || ""), "width:" + px(tw + 1) + ";height:" + px(th + 1) + ";left:" + px(-o.w / 2 + ox) + ";top:" + px(-o.h / 2 + oy) +
        ";background-position:" + px(-ox) + " " + px(-oy));
      g.appendChild(e);
    }
    return g;
  }

  // A cuboid whose bottom rests at y, centred on x and z. `faces` lists which faces to draw.
  function box(parent, o) {
    var g = node("g3 " + (o.cls || ""));
    var h = o.h, w = o.w, d = o.d;
    g.style.transform = "translate3d(" + px(o.x) + "," + px(o.y - h / 2) + "," + px(o.z) + ")" +
      (o.ry ? " rotateY(" + o.ry + "deg)" : "") + (o.rz ? " rotateZ(" + o.rz + "deg)" : "");
    var f = o.faces || "front top left right";
    var html = o.html || {};
    function add(name, fw, fh, tf) {
      if (f.indexOf(name) < 0) return;
      g.appendChild(node("f3 f3--" + name, "width:" + px(fw) + ";height:" + px(fh) + ";left:" + px(-fw / 2) + ";top:" + px(-fh / 2) + ";transform:" + tf, html[name]));
    }
    add("front", w, h, "translateZ(" + px(d / 2) + ")");
    add("back", w, h, "rotateY(180deg) translateZ(" + px(d / 2) + ")");
    add("right", d, h, "rotateY(90deg) translateZ(" + px(w / 2) + ")");
    add("left", d, h, "rotateY(-90deg) translateZ(" + px(w / 2) + ")");
    add("top", w, d, "rotateX(90deg) translateZ(" + px(h / 2) + ")");
    add("bottom", w, d, "rotateX(-90deg) translateZ(" + px(h / 2) + ")");
    parent.appendChild(g);
    return g;
  }
  function group(parent, cls, attrs, transform) {
    var g = node("g3 " + (cls || ""));
    if (attrs) for (var k in attrs) g.setAttribute(k, attrs[k]);
    if (transform) g.style.transform = transform;
    parent.appendChild(g);
    return g;
  }

  // A soft shadow or pool of light lying on a horizontal surface at height y (floor: y = -3, above
  // the rug at -1 and the sun patch at -2). Painted only: it never takes the pointer.
  function shade(parent, o) {
    return plane(parent, { cls: "shade3 " + (o.cls || "shade3--soft"), x: o.x, y: o.y == null ? -3 : o.y, z: o.z, w: o.w, h: o.h, rx: 90, rz: o.rz });
  }

  // A station's sign: a brass-edged plaque on two posts, standing on its object's top surface (y = top)
  // with the same gap above every object. safeFrame scales each sign so all three read at one size.
  var SIGN_GAP = 34;
  function sign(parent, o) {
    var s = group(parent, "sign3");
    s.dataset.base = "translate3d(" + px(o.x) + "," + px(o.top) + "," + px(o.z) + ")";
    s.style.transform = s.dataset.base;
    [-72, 72].forEach(function (x) { box(s, { cls: "brass brass--dark", x: x, y: 0, z: -4, w: 5, h: SIGN_GAP + 10, d: 5, faces: "front right" }); });
    plane(s, { cls: "plaque", x: 0, y: -SIGN_GAP - 25, z: 0, w: 220, h: 50, html: '<span class="plaque__verb">' + o.verb + '</span><span class="plaque__name">' + o.name + "</span>" });
    return s;
  }
  function scaleSign(s, k) { s.dataset.k = k; s.style.transform = s.dataset.base + " scale3d(" + k.toFixed(4) + "," + k.toFixed(4) + "," + k.toFixed(4) + ")"; }

  // Deterministic pseudo-random numbers: the room looks the same on every visit.
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  /* =====================================================================
     The room: 2000 wide, 1500 deep, 1000 high; floor at y = 0, back wall at z = -800
     ===================================================================== */

  var W = 2000, D = 1500, H = 1000, BACK = -800, FRONT = 700, MIDZ = (BACK + FRONT) / 2;

  function buildShell() {
    var s = group(world, "shell");
    // Shallow rows: a tile crossing the camera plane at a station drops less. Only depth matters for
    // that, so rows stay 150 deep while columns are wide: 40 tiles, not 100, to sort each frame.
    tiled(s, { cls: "floor", x: 0, y: 0, z: MIDZ, w: W, h: D, rx: 90 }, 4, 10);
    plane(s, { cls: "rug", x: 40, y: -1, z: -170, w: 760, h: 470, rx: 90, html: '<span class="rug__border"></span>' });
    // Late-afternoon sun through the window: a patch on the floor with the mullions' shadows in it,
    // thrown forward and a little to the right, and a faint shaft of light from the glass down to it.
    var sun = plane(s, { cls: "sun-patch", x: -10, y: -2, z: -470, w: 310, h: 250, rx: 90,
      html: '<span class="sun-patch__q" style="left:0;top:0"></span><span class="sun-patch__q" style="right:0;top:0"></span><span class="sun-patch__q" style="left:0;bottom:0"></span><span class="sun-patch__q" style="right:0;bottom:0"></span>' });
    sun.style.transform += " skewX(16deg)";
    // (No light shaft plane: a slanted plane cuts through the walls and ladder, and every such cut
    // is extra 3D sorting work each frame. The wall's glow around the window carries the light.)
    // Same rule for walls and ceiling: split along depth (side walls' columns, the ceiling's rows),
    // keep other splits few. The back wall never crosses the camera plane.
    tiled(s, { cls: "wall wall--back", x: 0, y: -H / 2, z: BACK, w: W, h: H }, 3, 2);
    tiled(s, { cls: "wall wall--side", x: -W / 2, y: -H / 2, z: MIDZ, w: D, h: H, ry: 90 }, 4, 1);
    tiled(s, { cls: "wall wall--side wall--right", x: W / 2, y: -H / 2, z: MIDZ, w: D, h: H, ry: -90 }, 4, 1);
    tiled(s, { cls: "ceiling", x: 0, y: -H, z: MIDZ, w: W, h: D, rx: -90 }, 2, 4);
    tiled(s, { cls: "wainscot", x: 0, y: -150, z: BACK + 1, w: W, h: 300 }, 2, 1);
    tiled(s, { cls: "wainscot", x: -W / 2 + 1, y: -150, z: MIDZ, w: D, h: 300, ry: 90 }, 4, 1);
    tiled(s, { cls: "wainscot wainscot--right", x: W / 2 - 1, y: -150, z: MIDZ, w: D, h: 300, ry: -90 }, 4, 1);
    box(s, { cls: "rail", x: 0, y: -296, z: BACK + 6, w: W, h: 12, d: 12, faces: "front top" });
    box(s, { cls: "rail", x: -W / 2 + 6, y: -296, z: MIDZ, w: 12, h: 12, d: D, faces: "right top" });
    box(s, { cls: "rail", x: W / 2 - 6, y: -296, z: MIDZ, w: 12, h: 12, d: D, faces: "left top" });
    box(s, { cls: "skirting", x: 0, y: 0, z: BACK + 8, w: W, h: 22, d: 16, faces: "front top" });
    // The window and its daylight
    plane(s, { cls: "window__glass", x: -60, y: -600, z: BACK + 2, w: 300, h: 400, html: '<span class="window__sky"></span>' });
    box(s, { cls: "trim", x: -60, y: -380, z: BACK + 10, w: 350, h: 22, d: 26, faces: "front top" });
    box(s, { cls: "trim", x: -60, y: -800, z: BACK + 8, w: 340, h: 20, d: 16, faces: "front bottom" });
    box(s, { cls: "trim", x: -220, y: -400, z: BACK + 8, w: 20, h: 400, d: 16, faces: "front right" });
    box(s, { cls: "trim", x: 100, y: -400, z: BACK + 8, w: 20, h: 400, d: 16, faces: "front left" });
    box(s, { cls: "trim", x: -60, y: -400, z: BACK + 6, w: 10, h: 400, d: 8, faces: "front" });
    box(s, { cls: "trim", x: -60, y: -595, z: BACK + 6, w: 300, h: 10, d: 8, faces: "front" });
    // A live clock, framed diagrams on the side walls
    plane(s, { cls: "clock", x: 300, y: -640, z: BACK + 3, w: 96, h: 96, html: '<span class="clock__h"></span><span class="clock__m"></span><span class="clock__s"></span><span class="clock__pin"></span>' });
    plane(s, { cls: "frame", x: -W / 2 + 4, y: -580, z: -320, w: 380, h: 240, ry: 90, html: periodic() });
    plane(s, { cls: "frame", x: W / 2 - 4, y: -580, z: -300, w: 320, h: 220, ry: -90, html: circuit() });
    plane(s, { cls: "frame", x: W / 2 - 4, y: -580, z: 330, w: 220, h: 220, ry: -90, html: cellDiagram() });   // forward, out of the overview, so never half-cropped at the edge
    // Pendant lamps
    [-330, 330].forEach(function (x) {   // between the stations, never in front of a sign
      box(s, { cls: "cord", x: x, y: -770, z: -300, w: 3, h: 230, d: 3, faces: "front right" });
      box(s, { cls: "pendant", x: x, y: -730, z: -300, w: 90, h: 44, d: 90, faces: "front left right bottom" });
      plane(s, { cls: "glow3 glow3--pendant", x: x, y: -728, z: -250, w: 190, h: 120 });
    });
  }

  function periodic() {
    var cells = "";
    for (var r = 0; r < 6; r++) for (var c = 0; c < 18; c++) {
      if (r === 0 && c > 0 && c < 17) continue;
      if ((r === 1 || r === 2) && c > 1 && c < 12) continue;
      cells += '<i style="grid-row:' + (r + 1) + ";grid-column:" + (c + 1) + ";background:" + (c < 2 ? "#C9B79A" : c > 11 ? "#B9C4CF" : "#D8D2C6") + '"></i>';
    }
    return '<span class="frame__mat"><span class="ptable">' + cells + '</span><span class="frame__cap">Periodic table</span></span>';
  }
  function circuit() {
    return '<span class="frame__mat"><svg viewBox="0 0 200 120" class="frame__svg"><g fill="none" stroke="#3B4552" stroke-width="2"><path d="M20 20H180V100H20Z"/><path d="M70 12v16M80 6v28" stroke-width="3"/><path d="M106 20l6-8 8 16 8-16 8 16 6-8" fill="#FBFAF7" stroke-linejoin="round"/><path d="M60 100l6-8 8 16 8-16 8 16 6-8" fill="#FBFAF7" stroke-linejoin="round"/></g></svg><span class="frame__cap">Series circuit</span></span>';
  }
  function cellDiagram() {
    return '<span class="frame__mat"><svg viewBox="0 0 120 110" class="frame__svg"><ellipse cx="60" cy="55" rx="48" ry="40" fill="#E4EDE6" stroke="#2F5B47" stroke-width="2"/><circle cx="56" cy="53" r="14" fill="#C9D9CD" stroke="#2F5B47" stroke-width="1.5"/><ellipse cx="86" cy="68" rx="10" ry="5" fill="none" stroke="#7B3F36" stroke-width="1.5"/><ellipse cx="34" cy="72" rx="9" ry="4" fill="none" stroke="#7B3F36" stroke-width="1.5"/></svg><span class="frame__cap">Animal cell</span></span>';
  }

  /* ---------- Learn: the bookcase ---------- */

  var BOOK_COLORS = ["#2D4A6E", "#7B3F36", "#2F5B47", "#5B4A3A", "#8C7B64", "#3E4A57", "#6B5B45", "#4F3B3A", "#7A6A50", "#34413A", "#A08F70", "#55606B"];

  function buildBookcase() {
    var x0 = -560, z0 = BACK + 70, w = 580, h = 780, d = 130;
    var g = group(world, "station3 station3--shelf", { "data-station": "learn" });
    box(g, { cls: "wood", x: x0 - w / 2 + 12, y: 0, z: z0, w: 24, h: h, d: d, faces: "front left right top" });
    box(g, { cls: "wood", x: x0 + w / 2 - 12, y: 0, z: z0, w: 24, h: h, d: d, faces: "front left right top" });
    box(g, { cls: "wood", x: x0, y: -h, z: z0 + 4, w: w + 24, h: 26, d: d + 10, faces: "front top left right bottom" });
    box(g, { cls: "wood wood--dark", x: x0, y: 0, z: z0 + 2, w: w, h: 40, d: d, faces: "front top" });
    plane(g, { cls: "case-back", x: x0, y: -h / 2, z: z0 - d / 2 + 2, w: w - 40, h: h - 30 });
    var shelves = [40, 225, 410, 595];
    shelves.forEach(function (sy, i) {
      if (i > 0) box(g, { cls: "wood", x: x0, y: -sy, z: z0, w: w - 48, h: 14, d: d - 8, faces: "front top bottom" });
      var room = (i < 3 ? shelves[i + 1] : h - 26) - sy - 14;
      fillShelf(g, x0 - (w - 48) / 2 + 4, x0 + (w - 48) / 2 - 4, -sy - (i > 0 ? 14 : 0), z0 + 4, room, i);
    });
    // The ladder, leaning on the case
    var lad = group(g, "ladder", null, "translate3d(" + px(x0 + w / 2 + 70) + ",0," + px(z0 + 110) + ") rotateX(-11deg)");
    [-34, 34].forEach(function (lx) { box(lad, { cls: "wood", x: lx, y: 0, z: 0, w: 10, h: 760, d: 10, faces: "front left right" }); });
    for (var r = 1; r < 8; r++) box(lad, { cls: "wood", x: 0, y: -r * 94, z: 0, w: 70, h: 8, d: 8, faces: "front top" });
    // A globe on top of the case
    var gl = group(g, "globe", null, "translate3d(" + px(x0 + 180) + "," + px(-h - 26) + "," + px(z0) + ")");
    box(gl, { cls: "brass", x: 0, y: 0, z: 0, w: 46, h: 8, d: 46, faces: "front top left right" });
    box(gl, { cls: "brass", x: 0, y: -8, z: 0, w: 5, h: 34, d: 5, faces: "front right" });
    for (var a = 0; a < 180; a += 45) plane(gl, { cls: "globe__disc", x: 0, y: -80, z: 0, w: 80, h: 80, ry: a });
    sign(g, { x: x0 - 60, top: -h - 26, z: z0 + 40, verb: "Learn", name: "The bookshelf" });
    plane(g, { cls: "glow3 glow3--hot glow3--edge", x: x0, y: -h / 2 - 10, z: BACK + 4.5, w: w - 20, h: h - 10 });   // glows out around the case's outline
    shade(g, { cls: "glow3 glow3--hot glow3--floor", x: x0, y: -3.5, z: z0 + d / 2 + 60, w: w + 120, h: 200 });
    // Shadow along the case's base, reaching under the ladder's feet. Few, large shadow planes: each
    // plane is sorted against the others every frame, so they are merged where they meet.
    shade(shadows, { cls: "shade3--strip", x: x0 + 50, z: z0 + d / 2 + 40, w: w + 140, h: 90 });
  }

  function fillShelf(g, xa, xb, yBase, z, space, shelfIndex) {
    var x = xa;
    var special = shelfIndex === 2 ? [{ id: "physics", c: "#2D4A6E", t: "Physics", h: 0.92 }, { id: "chemistry", c: "#7B3F36", t: "Chemistry", h: 0.84 }, { id: "biology", c: "#2F5B47", t: "Biology", h: 0.88 }] : [];
    var placed = 0, minNext = 0;
    while (x < xb - 14) {
      var sp = special.length && placed >= 4 ? special.shift() : null;
      // Widths from slim to thick, with the odd heavy volume; heights from a third short to near the shelf above
      var bw = sp ? 32 : (rnd() < 0.1 ? 34 + Math.round(rnd() * 8) : 12 + Math.round(rnd() * 20));
      if (x + bw > xb) { bw = Math.floor(xb - x); if (sp || bw < 12) break; }   // end the shelf with a slim one
      var bh = Math.round(space * (sp ? sp.h : 0.55 + rnd() * 0.4));
      if (minNext) { bh = Math.min(Math.round(space * 0.95), Math.max(bh, minNext)); minNext = 0; }
      var col = sp ? sp.c : shadeHex(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)], (rnd() - 0.5) * 0.24);
      var d = sp ? 92 : 84 + Math.round(rnd() * 12);           // uneven depths: the fronts don't line up exactly
      var bz = sp ? z : z + (d - 92) / 2;
      // A leaning book: tipped toward the next one, pivoting on its bottom-right corner so it never
      // sinks into the shelf; the next book stands where the lean's top corner touches it.
      var lean = 0;   // never just before a subject book, whose height is fixed
      if (!sp && placed > 1 && rnd() < 0.08 && !(special.length && placed >= 3) && x + bw + 60 < xb) lean = 5 + rnd() * 7;
      var bands = sp ? '<span class="book3__band"></span>' : bandsFor();
      var opts = { cls: "book3" + (sp ? " book3--subject" : ""), x: x + bw / 2, y: yBase, z: bz, w: bw, h: bh, d: d, faces: "front right top",
        html: { front: bands + (sp ? '<span class="book3__t">' + sp.t + "</span>" : "") } };
      if (lean) {
        var t = lean * Math.PI / 180, xr = x + bw, c = Math.cos(t), s = Math.sin(t);
        opts.x = xr - bw / 2 * c + bh / 2 * s;
        opts.y = yBase - bw / 2 * s - bh / 2 * c + bh / 2;
        opts.rz = lean;
      }
      var b = box(g, opts);
      b.style.setProperty("--c", col);
      if (sp) { b.setAttribute("data-book", sp.id); b.dataset.base = b.style.transform; }
      if (lean) {
        x = xr + bh * Math.sin(lean * Math.PI / 180) + 1;
        minNext = Math.ceil(bh * Math.cos(lean * Math.PI / 180)) + 2;
      } else x += bw + (rnd() < 0.08 ? 7 : 1);
      placed++;
      if (!lean && rnd() < 0.07 && x < xb - 80) {   // a book or two lying flat
        var n = rnd() < 0.4 ? 2 : 1;
        for (var k = 0; k < n; k++) {
          var f = box(g, { cls: "book3", x: x + 36 + k * 3, y: yBase - k * 18, z: z, w: 68 - k * 6, h: 18, d: 90, faces: "front right top", html: { front: bandsFor() } });
          f.style.setProperty("--c", shadeHex(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)], (rnd() - 0.5) * 0.2));
        }
        x += 76;
      }
    }
  }
  // Gilt bands on a spine: none, one near the head, or a pair at head and foot.
  function bandsFor() {
    var r = rnd();
    if (r < 0.25) return "";
    var top = (8 + Math.round(rnd() * 8)) + "%";
    var out = '<span class="book3__band" style="top:' + top + '"></span>';
    if (r > 0.6) out += '<span class="book3__band" style="top:auto;bottom:' + (8 + Math.round(rnd() * 6)) + '%"></span>';
    return out;
  }
  // Lighten (amt > 0) or darken a #RRGGBB colour.
  function shadeHex(hex, amt) {
    var n = parseInt(hex.slice(1), 16), out = "#";
    [16, 8, 0].forEach(function (sh) {
      var v = (n >> sh) & 255;
      v = Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
      out += ("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
    });
    return out;
  }

  /* ---------- Apply: the reading desk ---------- */

  function buildDesk() {
    var x0 = 30, z0 = -250;
    var g = group(world, "station3 station3--desk", { "data-station": "apply" });
    box(g, { cls: "wood wood--warm", x: x0, y: -200, z: z0, w: 460, h: 26, d: 230, faces: "front top left right" });
    [[-210, -95], [210, -95], [-210, 95], [210, 95]].forEach(function (p) { box(g, { cls: "wood wood--warm", x: x0 + p[0], y: 0, z: z0 + p[1], w: 20, h: 200, d: 20, faces: "front left right" }); });
    box(g, { cls: "wood wood--warm", x: x0, y: -150, z: z0 + 104, w: 400, h: 50, d: 8, faces: "front" });
    box(g, { cls: "brass", x: x0, y: -168, z: z0 + 109, w: 50, h: 6, d: 4, faces: "front top" });
    // Shadows under the desk (thrown a little forward and right by the window) and under the chair
    shade(shadows, { cls: "shade3--deep", x: x0 + 24, z: z0 + 30, w: 560, h: 330 });
    shade(shadows, { x: x0 - 236, z: z0 + 262, w: 220, h: 200, rz: -32 });
    // The desktop is 460 x 230 with its surface at y = -226 (TOP). Everything on it is laid out from
    // its rotated extents so nothing overhangs an edge or overlaps a neighbour:
    //   lamp, back left (x -194..-150) | notebook, centre (x -137..109, z -68..112)
    //   book stack, back right (x 113..222, z -101..-15) | pencil, front right (x 134..219, z 47..90)
    var TOP = -226;
    // The desk lamp: a small brass base, a stem, and a shade leaning over the notebook
    var lx = x0 - 172, lz = z0 - 62;
    box(g, { cls: "brass", x: lx, y: TOP, z: lz, w: 44, h: 8, d: 34, faces: "front top left right" });
    box(g, { cls: "brass brass--dark", x: lx, y: TOP - 8, z: lz, w: 5, h: 112, d: 5, faces: "front right" });
    box(g, { cls: "lamp-shade", x: lx + 20, y: TOP - 112, z: lz + 4, w: 74, h: 30, d: 44, rz: 14, faces: "front left right top bottom" });
    plane(g, { cls: "glow3 glow3--lamp", x: lx + 24, y: TOP - 110, z: lz + 40, w: 180, h: 130 });   // the bulb's glow
    plane(g, { cls: "lamp-pool", x: x0 - 96, y: TOP - 3, z: z0 - 14, w: 250, h: 180, rx: 90 });       // its light on the desk, over the notebook
    // The open notebook: what Apply will be. Two pages on a cloth cover, turned a little. One plane
    // with the pages inside it: separate planes this close together sort unreliably and flicker.
    var nb = plane(g, { cls: "nb-cover", x: x0 - 14, y: TOP - 1, z: z0 + 22, w: 248, h: 172, rx: 90,
      html: '<span class="page3"><span class="nb__h">Find the wrong step</span><span class="nb__l">N = mg</span><span class="nb__l nb__l--x">N = mg cos 30°</span><span class="nb__l">= 17.0 N</span></span>' +
        '<span class="page3 page3--right"><span class="nb__h">With the tutor</span><span class="nb__p">Check a classmate’s solution, step by step, and fix it.</span></span>' });
    nb.style.transform += " rotateZ(-4deg)";   // in the desk's plane: turned about the vertical
    // The pencil, lying flat
    box(g, { cls: "pencil", x: x0 + 176, y: TOP, z: z0 + 68, w: 92, h: 6, d: 6, ry: 24, faces: "front top" });
    // A stack of three books, each resting on the one below
    shade(g, { cls: "shade3--soft", x: x0 + 174, y: TOP - 0.6, z: z0 - 50, w: 140, h: 110 });
    [["#3E4A57", 0, 0], ["#7B3F36", 3, 6], ["#8C7B64", -2, -5]].forEach(function (b, i) {
      box(g, { cls: "book3", x: x0 + 168 + b[1], y: TOP - i * 20, z: z0 - 58, w: 100, h: 20, d: 72, ry: b[2], faces: "front right top" }).style.setProperty("--c", b[0]);
    });
    // The chair, pulled out from the desk's front-left corner and turned toward it, so the desktop
    // stays in clear view from the doorway.
    var ch = group(g, "chair", null, "translate3d(" + px(x0 - 250) + ",0," + px(z0 + 250) + ") rotateY(-32deg)");
    box(ch, { cls: "wood wood--warm", x: 0, y: -120, z: 0, w: 150, h: 16, d: 132, faces: "front top left right" });
    box(ch, { cls: "wood wood--warm", x: 0, y: -136, z: 60, w: 150, h: 150, d: 12, faces: "front back left right top" });
    [[-65, -56], [65, -56], [-65, 56], [65, 56]].forEach(function (p) { box(ch, { cls: "wood wood--warm", x: p[0], y: 0, z: p[1], w: 12, h: 120, d: 12, faces: "front left right" }); });
    sign(g, { x: x0 + 4, top: TOP, z: z0 - 106, verb: "Apply", name: "The reading desk" });   // between the lamp and the books
    plane(g, { cls: "glow3 glow3--hot", x: x0, y: -230, z: z0 - 140, w: 760, h: 520 });
    shade(g, { cls: "glow3 glow3--hot glow3--floor", x: x0, y: -3.5, z: z0 + 20, w: 640, h: 380 });
  }

  /* ---------- Practice: the card catalog ---------- */

  // The room's catalog is a scale model of the working cabinet (cabinet.js: 760 x 380, three by two
  // drawers, 22px margin, 12px gaps, 30px plinth), so flying in and handing over to the working
  // cabinet changes nothing you can see: same proportions, same labels, same top and sign.
  var CAB = { W: 760, H: 380, pad: 22, gap: 12, base: 30, cols: 3, rows: 2 };
  function catalogFront() {
    var dw = (CAB.W - 2 * CAB.pad - (CAB.cols - 1) * CAB.gap) / CAB.cols;
    var dh = (CAB.H - CAB.pad - CAB.base - (CAB.rows - 1) * CAB.gap) / CAB.rows;
    var out = "";
    for (var i = 0; i < 6; i++) {
      var c = i % CAB.cols, r = Math.floor(i / CAB.cols);
      var pw = Math.round(dw * 0.3);
      out += '<span class="cat__d" style="left:' + (CAB.pad + c * (dw + CAB.gap)) + "px;top:" + (CAB.pad + r * (dh + CAB.gap)) + "px;width:" + dw + "px;height:" + dh + 'px">' +
        '<span class="cat__l"></span>' +
        '<span class="cat__p" style="left:' + Math.round((dw - pw) / 2) + "px;top:" + Math.round(dh * 0.74) + "px;width:" + pw + 'px"></span></span>';
    }
    return '<span class="cat__face" style="width:' + CAB.W + "px;height:" + CAB.H + 'px">' + out + "</span>";
  }
  // Copy the working cabinet's drawer labels (call number, count, title) onto the model.
  function syncCatalogLabels() {
    var src = document.querySelectorAll("#drawers .drawer__holder");
    var dst = world.querySelectorAll(".station3--catalog .cat__l");
    for (var i = 0; i < dst.length && i < src.length; i++) {
      if (dst[i].innerHTML !== src[i].innerHTML) dst[i].innerHTML = src[i].innerHTML;
    }
  }

  function buildCatalog() {
    var x0 = 560, z0 = BACK + 120, w = 520, h = w * CAB.H / CAB.W, d = 200, lift = 90, k = w / CAB.W;
    var g = group(world, "station3 station3--catalog", { "data-station": "practice" });
    g.style.setProperty("--cat-k", k.toFixed(5));
    box(g, { cls: "wood wood--dark", x: x0, y: -lift + 20, z: z0, w: w - 20, h: 20, d: d - 20, faces: "front top" });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, { cls: "wood wood--dark", x: x0 + s[0] * (w / 2 - 30), y: 0, z: z0 + s[1] * (d / 2 - 30), w: 18, h: lift, d: 18, faces: "front left right" }); });
    var stand = g;
    // The carcass is the only part the working cabinet replaces; the top and what stands on it stay.
    box(group(g, "cat-body"), { cls: "cabinet3", x: x0, y: -lift, z: z0, w: w, h: h, d: d, faces: "front top left right", html: { front: catalogFront() } });
    // The top overhangs like the working cabinet's cornice: 8px each side and in front, 14px thick (scaled).
    box(g, { cls: "cabinet3 cat-top", x: x0, y: -lift - h, z: z0 + (8 * k) / 2, w: w + 16 * k, h: 14 * k, d: d + 8 * k, faces: "front top left right" });
    g = group(g, "cat-deco");   // fades while flashcards stand on the top
    box(g, { cls: "wood", x: x0 - 130, y: -lift - h - 14 * k, z: z0, w: 120, h: 20, d: 80, faces: "front top left right" });
    for (var c = 0; c < 6; c++) plane(g, { cls: "card3", x: x0 - 130, y: -lift - h - 14 * k - 36, z: z0 - 28 + c * 10, w: 108, h: 56, rx: -8 });
    sign(g, { x: x0 + 70, top: -lift - h - 14 * k, z: z0 + 40, verb: "Practice", name: "The card catalog" });   // clear of the card tray
    plane(stand, { cls: "glow3 glow3--hot glow3--edge", x: x0, y: -(lift + h) / 2 - 10, z: BACK + 4.5, w: w - 20, h: lift + h });
    shade(stand, { cls: "glow3 glow3--hot glow3--floor", x: x0, y: -3.5, z: z0 + d / 2 + 40, w: w + 160, h: 220 });
    void stand;
    shade(shadows, { cls: "shade3--deep", x: x0 + 90, z: z0 + 34, w: w + 300, h: d + 130 });   // the catalog's and the plant's, as one
    // The plant in the corner
    var pl = group(world, "plant", null, "translate3d(" + px(W / 2 - 130) + ",0," + px(BACK + 150) + ")");
    box(pl, { cls: "pot", x: 0, y: 0, z: 0, w: 96, h: 110, d: 96, faces: "front left right top" });
    for (var k = 0; k < 9; k++) plane(pl, { cls: "leaf", x: 0, y: -200 - (k % 3) * 40, z: 0, w: 70, h: 200, ry: k * 40, rz: (k % 2 ? 1 : -1) * (10 + k * 3) });
  }

  /* =====================================================================
     Camera: a pose (position, yaw, pitch); the world moves by the inverse
     ===================================================================== */

  // The perspective scales with the window width, so the framing (field of view) is the same on a
  // laptop and on a 2560px monitor; a fixed 900px saw past the room's walls on wide screens.
  var PERSPECTIVE = 900;
  var CATALOG = { x: 560, front: BACK + 120 + 100, w: 520, cy: -90 - 520 * 380 / 760 / 2 };
  var POSES = {
    overview: { x: 0, y: -560, z: 1260, yaw: 0, pitch: -14 },
    learn: { x: -560, y: -430, z: -150, yaw: 0, pitch: -4 },
    apply: { x: 40, y: -560, z: 40, yaw: 0, pitch: -46 },
    practice: { x: 560, y: -290, z: -150, yaw: 0, pitch: -8 }
  };
  var pose = Object.assign({}, POSES.overview), from = pose, to = pose;
  var look = { yaw: 0, pitch: 0, ty: 0, tp: 0, raf: 0 };
  var state = "overview";   // overview | flying | desk | away
  var release = null;
  var lastStation = null;

  function applyCamera() {
    var yaw = pose.yaw + look.yaw, pitch = pose.pitch + look.pitch;
    // The leading translateY is the overview's safe-zone shift (safeFrame; 0 at stations). First in
    // the chain, it moves the camera's centre on screen exactly as a layout offset would, without layout.
    cam.style.transform = "translateY(" + (pose.sh || 0).toFixed(1) + "px) translateZ(" + PERSPECTIVE + "px) rotateX(" + pitch.toFixed(3) + "deg) rotateY(" + yaw.toFixed(3) + "deg) translate3d(" +
      (-pose.x).toFixed(2) + "px," + (-pose.y).toFixed(2) + "px," + (-pose.z).toFixed(2) + "px)";
  }
  var frameShift = 0;
  function poseFor(name) { return Object.assign({ sh: name === "overview" ? frameShift : 0 }, POSES[name]); }
  var fly = SB.createSpring(P.camera, function (k) {
    var p = {};
    for (var key in to) p[key] = lerp(from[key], to[key], k);
    pose = p;
    applyCamera();
  }, 1);
  function flyTo(name) {
    from = Object.assign({ sh: 0 }, pose);
    to = poseFor(name);
    if (SB.reducedMotion()) { pose = Object.assign({}, to); applyCamera(); return Promise.resolve(); }
    fly.jump(0);
    fly.to(1);
    return fly.near(0.004);   // arrived when it looks arrived, not after the spring's long tail
  }

  // Pointer look: up to 3deg of yaw and 1.5deg of pitch toward the cursor, lerped; mouse only.
  function lookTick() {
    look.yaw += (look.ty - look.yaw) * 0.08;
    look.pitch += (look.tp - look.pitch) * 0.08;
    applyCamera();
    if (Math.abs(look.ty - look.yaw) > 0.003 || Math.abs(look.tp - look.pitch) > 0.003) look.raf = requestAnimationFrame(lookTick);
    else look.raf = 0;
  }
  room.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || SB.reducedMotion() || state !== "overview") return;
    look.ty = (e.clientX / innerWidth - 0.5) * 6;
    look.tp = -(e.clientY / innerHeight - 0.5) * 3;
    if (!look.raf) look.raf = requestAnimationFrame(lookTick);
  });
  function settleLook() { look.ty = 0; look.tp = 0; if (!look.raf) look.raf = requestAnimationFrame(lookTick); }

  /* =====================================================================
     Stations: enter, leave, the desk close-up
     ===================================================================== */

  function busy() { return (SB.bookOpen && SB.bookOpen()) || (SB.debug && SB.debug.drawer() !== "closed") || (SB.desk && SB.desk.isOpen()); }

  function highlight(name) {
    $$(".station3", world).forEach(function (s) { s.classList.toggle("is-hot", s.dataset.station === name); });
    $$(".rnav__btn", room).forEach(function (b) { b.classList.toggle("is-hot", b.dataset.station === name); });
  }
  function crossfade(elm, a, b, ms) {
    if (SB.reducedMotion()) ms = 150;
    var an = elm.animate([{ opacity: a }, { opacity: b }], { duration: ms, fill: "both" });
    return an.finished.then(function () { elm.style.opacity = b === 1 ? "" : String(b); an.cancel(); });
  }

  function enter(name) {
    if (state !== "overview") return;
    lastStation = name;
    highlight(name);
    settleLook();
    state = "flying";
    if (name === "apply") {
      // The reading desk is its own scene (desk.js); it calls SB.room.back() when it closes.
      // Drop the room's focus trap before the desk sets its own; releasing it afterwards would
      // un-inert the page behind the desk.
      flyTo("apply").then(function () {
        if (release) { release(); release = null; }
        return SB.desk.open();
      }).then(function () {
        room.hidden = true;
        state = "away";
      });
      return;
    }
    if (name === "learn") {
      room.classList.add("at-station");
      return flyTo("learn").then(function () {
        state = "learn";
        room.classList.add("is-learn", "at-station");
        if (release) release();
        release = ui.isolate([room, stationBack]);   // the Back button must stay reachable
        showBack(true);
        var first = $(".rbooks__btn", room);
        if (first) first.focus({ preventScroll: true });
        ui.announce("The bookshelf. Choose a book to open it.");
      });
      return;
    }
    if (name === "practice") {
      syncCatalogLabels();
      POSES.practice = practicePose();
      room.classList.add("at-station");
      return flyTo("practice").then(function () { enterPractice(); });
    }
    flyTo(name).then(function () {
      SB.jumpScene(name === "practice" ? 1 : 0);
      return crossfade(room, 1, 0, 240);
    }).then(function () {
      room.hidden = true;
      state = "away";
      if (release) { release(); release = null; }
      link.hidden = false;
      history.replaceState(null, "", name === "practice" ? "#practice" : "#shelf");
      $(name === "practice" ? "#h-b" : "#h-a").focus({ preventScroll: true });
      ui.announce(name === "practice" ? "The card catalog. Practice your mistakes." : "The bookshelf. Learn your mistakes.");
    });
  }

  // opts.under: the room comes back fully visible beneath a layer that is about to fade out (the desk).
  function backToRoom(opts) {
    var under = !!(opts && opts.under);
    if (busy() || state !== "away") return;
    var name = lastStation || (SB.debug.scene() === 1 ? "practice" : "learn");
    pose = Object.assign({}, POSES[name]);
    look.yaw = look.pitch = look.ty = look.tp = 0;
    applyCamera();
    room.hidden = false;
    room.style.opacity = under ? "" : "0";
    link.hidden = true;
    release = ui.isolate([room]);
    history.replaceState(null, "", location.pathname);
    state = "flying";
    (under ? ui.wait(220) : crossfade(room, 0, 1, 220)).then(function () { return flyTo("overview"); }).then(function () {
      state = "overview";
      highlight(null);
      var b = $('.rnav__btn[data-station="' + name + '"]', room);
      if (b) b.focus({ preventScroll: true });
      ui.announce("The library.");
    });
  }

  /* ---------- Wiring ---------- */

  world.addEventListener("click", function (e) {
    var s = e.target.closest("[data-station]");
    if (s) enter(s.dataset.station);
  });
  world.addEventListener("pointerover", function (e) {
    if (state !== "overview") return;
    var s = e.target.closest("[data-station]");
    highlight(s ? s.dataset.station : null);
  });
  $$(".rnav__btn", room).forEach(function (b) {
    b.addEventListener("click", function () { enter(b.dataset.station); });
    b.addEventListener("focus", function () { if (state === "overview") highlight(b.dataset.station); });
    b.addEventListener("pointerenter", function () { if (state === "overview") highlight(b.dataset.station); });
  });
  link.addEventListener("click", function () { backToRoom(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (state === "learn" && !busy()) { e.preventDefault(); leaveStation(); return; }
    if (state === "practice" && !busy() && !SB.review.isOpen() && !(SB.panel && SB.panel.isOpen())) { e.preventDefault(); leaveStation(); return; }
    if (state === "away" && !busy() && !SB.review.isOpen() && !(SB.panel && SB.panel.isOpen())) backToRoom();
  });

  /* ---------- In-room stations: open books on the room's shelf, drawers over the room's catalog ---------- */

  var stationBack = document.createElement("button");
  stationBack.type = "button";
  stationBack.className = "station-back";
  stationBack.hidden = true;
  stationBack.innerHTML = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to the Library';
  document.body.appendChild(stationBack);
  stationBack.addEventListener("click", function () { if (!busy()) leaveStation(); });
  function showBack(on) { stationBack.hidden = !on; }

  // Learn: a subject book slides out of the room's shelf, then the open-book sequence takes over.
  var pulls = {};
  function pullSpring(b) {
    if (!pulls[b.dataset.book]) {
      pulls[b.dataset.book] = SB.createSpring(P.drawer, function (k) {
        b.style.transform = b.dataset.base + " translate3d(0," + (-22 * k).toFixed(2) + "px," + (120 * k).toFixed(2) + "px) rotateY(" + (-72 * k).toFixed(2) + "deg)";
      }, 0);
    }
    return pulls[b.dataset.book];
  }
  function openRoomBook(id) {
    if (state !== "learn" || busy()) return;
    var b = $('[data-book="' + id + '"]', world);
    var btn = $('.rbooks__btn[data-book="' + id + '"]', room);
    if (!b) return;
    state = "reading";
    var sp = pullSpring(b);
    var cover = $(".f3--right", b);   // turned toward the camera, this face is the front cover
    sp.to(1);
    sp.near(0.03).then(function () {
      SB.jumpScene(0);   // the book engine lives on the shelf scene, behind the room
      var ok = SB.openBookFromRoom(id, {
        focusEl: btn,
        coverRect: function () { return cover.getBoundingClientRect(); },
        onHandoff: function () { b.style.visibility = "hidden"; },      // the open book takes its place
        onReturn: function () { b.style.visibility = ""; },             // back in the hand, before it slides home
        onClosed: function () {
          b.style.visibility = "";
          sp.to(0);
          state = "learn";
          if (release) release();
          release = ui.isolate([room, stationBack]);
        }
      });
      if (!ok) { sp.to(0); state = "learn"; }
    });
  }

  // Practice: the working cabinet is laid over the room's catalog; the room stays in view behind it.
  // The cabinet scene uses the room's perspective, centred on the screen like the room's camera, and
  // faces the camera squarely. The scene box is moved (layout, not a transform) so the cabinet's
  // front lands on the room catalog's front; a final scale inside the rig trims any residue.
  function alignCabinet() {
    if (!document.documentElement.classList.contains("room-practice")) return;
    var scene = $("#cab-scene");
    var body = $(".station3--catalog .cat-body", world);
    var front = $(".station3--catalog .cabinet3 .f3--front", world);
    body.style.visibility = "visible";
    var t = front.getBoundingClientRect();
    body.style.visibility = "";
    scene.style.left = scene.style.right = scene.style.top = "";
    scene.style.perspective = PERSPECTIVE.toFixed(1) + "px";
    SB.cabOverlay = { dx: 0, dy: 0, s: 1, rx: -4, ry: 0 };
    SB.renderCabinet();
    var a = $("#cab-front").getBoundingClientRect();
    SB.cabOverlay.s = t.width / a.width;
    SB.renderCabinet();
    a = $("#cab-front").getBoundingClientRect();
    var dx = t.left + t.width / 2 - (a.left + a.width / 2), dy = t.top + t.height / 2 - (a.top + a.height / 2);
    scene.style.left = dx.toFixed(1) + "px";
    scene.style.right = (-dx).toFixed(1) + "px";
    scene.style.top = dy.toFixed(1) + "px";
    var box = scene.getBoundingClientRect();
    scene.style.perspectiveOrigin = (innerWidth / 2 - box.left).toFixed(1) + "px " + (innerHeight / 2 - box.top).toFixed(1) + "px";
    // The drawer bar is laid out against the scene track, which starts below the hidden headings:
    // cap its top so it stays above the bottom of the window.
    var track = $("#track");
    if (track) $("#library").style.setProperty("--room-bar-top", (innerHeight - track.getBoundingClientRect().top - 64).toFixed(1) + "px");
  }
  function enterPractice() {
    window.scrollTo(0, 0);
    SB.jumpScene(1);
    document.documentElement.classList.add("room-practice");
    alignCabinet();
    requestAnimationFrame(alignCabinet);   // once more after the class settles layout
    if (release) { release(); release = null; }
    room.inert = true;
    release = ui.isolate([$("#library"), stationBack]);
    state = "practice";
    showBack(true);
    var first = $('.dslot[data-id="flashcards"] .drawer');
    if (first) first.focus({ preventScroll: true });
    ui.announce("The card catalog. Choose a drawer.");
  }
  function leavePractice() {
    syncCatalogLabels();   // counts may have changed while practising
    document.documentElement.classList.remove("room-practice", "cab-stand");
    var scene = $("#cab-scene");
    ["left", "right", "top", "perspective", "perspectiveOrigin", "transform", "transformOrigin"].forEach(function (k) { scene.style[k] = ""; });
    SB.cabOverlay = null; SB.renderCabinet();
    $("#library").style.removeProperty("--room-bar-top");
    room.inert = false;
  }

  function leaveStation() {
    if (state !== "learn" && state !== "practice") return;
    var name = state;
    if (name === "practice") leavePractice();
    room.classList.remove("is-learn", "at-station");
    showBack(false);
    if (release) release();
    release = ui.isolate([room]);
    state = "flying";
    flyTo("overview").then(function () {
      state = "overview";
      highlight(null);
      var b = $('.rnav__btn[data-station="' + name + '"]', room);
      if (b) b.focus({ preventScroll: true });
      ui.announce("The library.");
    });
  }

  $$(".rbooks__btn", room).forEach(function (b) { b.addEventListener("click", function () { openRoomBook(b.dataset.book); }); });
  world.addEventListener("click", function (e) {
    var book = e.target.closest("[data-book]");
    if (book && state === "learn") { e.stopPropagation(); openRoomBook(book.dataset.book); }
  }, true);
  window.addEventListener("resize", function () { if (state === "practice") alignCabinet(); });

  // The wall clock keeps real time.
  function tick() {
    var d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    var set = function (sel, deg) { var n = $(sel, world); if (n) n.style.transform = "rotate(" + deg.toFixed(1) + "deg)"; };
    set(".clock__h", h * 30); set(".clock__m", m * 6); set(".clock__s", s * 6);
  }

  // Narrow viewports pull the camera back so the whole room stays in frame.
  function fit() {
    PERSPECTIVE = Math.max(240, innerWidth * 0.66);
    $("#env").style.perspective = PERSPECTIVE.toFixed(1) + "px";
    var tall = innerHeight / innerWidth > 1.1;   // phones: stand back a little to see the floor
    // A little higher and further back than eye level, looking down onto the reading desk.
    // Short, wide windows stand back further, so the desk clears the station bar below.
    var wide = innerHeight / innerWidth < 0.6;
    POSES.overview = tall ? { x: 0, y: -600, z: 1400, yaw: 0, pitch: -14 } : wide ? { x: 0, y: -600, z: 1480, yaw: 0, pitch: -15 } : { x: 0, y: -560, z: 1260, yaw: 0, pitch: -14 };
    POSES.practice = practicePose();
    if (state === "overview" && !fly.moving()) { pose = poseFor("overview"); applyCamera(); }
    if (state === "practice") { pose = Object.assign({}, POSES.practice); applyCamera(); alignCabinet(); }
    if (state === "learn" || state === "reading") { pose = Object.assign({}, POSES.learn); applyCamera(); }
    safeFrame();
  }

  // Keep the overlay and the 3D labels apart. The heading's band is a safe zone at the top and the
  // station bar one at the bottom. From the overview pose, measure the signs and pendant lamps and
  // slide the scene down until they clear the band. The shift belongs to the overview pose only
  // (pose.sh): flights ease it to 0 at a station, where the heading is hidden, and back on return.
  function safeFrame() {
    if (room.hidden) return;
    var hb = 0;
    $$(".room__head > *", room).forEach(function (e) { hb = Math.max(hb, e.getBoundingClientRect().bottom); });
    room.style.setProperty("--head-h", Math.round(hb) + "px");
    if (state !== "overview" || fly.moving()) return;
    var ly = look.yaw, lp = look.pitch;
    pose = Object.assign({}, POSES.overview, { sh: 0 });
    look.yaw = look.pitch = 0;
    applyCamera();
    // One size for every sign: the stations stand at different depths, so scale each sign until its
    // plaque spans the same width on screen (the mean, but never under a tenth of the window, or
    // under 15% on a phone so the three still read as signs).
    var signs = $$(".sign3", world);
    signs.forEach(function (s) { scaleSign(s, 1); });
    var widths = signs.map(function (s) { return $(".plaque", s).getBoundingClientRect().width; });
    var mean = widths.reduce(function (a, b) { return a + b; }, 0) / (widths.length || 1);
    var target = Math.max(mean, innerWidth * (innerHeight / innerWidth > 1.1 ? 0.15 : 0.1));
    for (var pass = 0; pass < 2; pass++) {
      signs.forEach(function (s, i) {
        var wNow = pass ? $(".plaque", s).getBoundingClientRect().width : widths[i];
        if (wNow > 0) scaleSign(s, +s.dataset.k * target / wNow);
      });
    }
    // Under perspective a screen offset moves distant things less than near ones, so converge on it.
    var shift = 0;
    for (var i = 0; i < 4; i++) {
      pose.sh = Math.round(shift);
      applyCamera();
      var top = Infinity;
      $$(".plaque, .pendant .f3, .globe__disc", world).forEach(function (e) {
        var r = e.getBoundingClientRect();
        if (r.width) top = Math.min(top, r.top);
      });
      var need = hb + 16 - top;
      if (Math.abs(need) < 1 || (shift === 0 && need < 0)) break;
      shift = Math.max(0, shift + need * 1.15);
    }
    frameShift = Math.round(shift);
    look.yaw = ly; look.pitch = lp;
    pose = poseFor("overview");
    applyCamera();
  }
  // Stand back exactly far enough that the room's catalog appears at the working cabinet's natural
  // size: then the cabinet replaces it at scale 1, and its drawers and fan keep their real size.
  function practicePose() {
    var natural = SB.cabinetWidth ? SB.cabinetWidth() : 760;
    // About half the window, within limits: labels stay readable and the fan stays on screen.
    var target = Math.max(600, Math.min(innerWidth * 0.48, 1000));
    void natural;
    var dist = CATALOG.w * PERSPECTIVE / Math.max(200, target);
    // Framed so the cabinet and the cards standing on its top sit just above the drawer bar.
    return { x: CATALOG.x, y: CATALOG.cy - 110, z: CATALOG.front + dist, yaw: 0, pitch: -3 };
  }

  buildShell();
  var shadows = group(world, "shadows");   // outside the stations, so a shadow never starts a hover
  buildBookcase();
  buildDesk();
  buildCatalog();
  if (SB.store && SB.store.ready) SB.store.ready.then(function () { requestAnimationFrame(syncCatalogLabels); });
  // No two pieces of wood alike: a small shift in tone and in where the grain falls.
  $$(".wood, .cabinet3", world).forEach(function (w) {
    var a = (rnd() - 0.5) * 0.12;
    if (w.classList.contains("cabinet3")) a = 0;   // the catalog matches the working cabinet exactly
    w.style.setProperty("--wt", a > 0 ? "rgba(255, 238, 210, " + a.toFixed(3) + ")" : "rgba(30, 18, 8, " + (-a).toFixed(3) + ")");
    w.style.setProperty("--wp", Math.round(rnd() * 90) + "px");
  });
  fit();
  tick();
  setInterval(tick, 1000);
  window.addEventListener("resize", fit);

  // Boot. Deep links for people (#shelf, #practice, #book-<subject>, from the dashboard) open the
  // room and fly into that station, so the flat scenes behind the room are never shown on their own.
  // #test-shelf and #test-practice skip the room to those flat scenes; they exist for the test suite only.
  var hash = location.hash.slice(1);
  var bookId = /^book-(physics|chemistry|biology)$/.test(hash) ? hash.slice(5) : null;
  var station = hash === "shelf" || bookId ? "learn" : hash === "practice" ? "practice" : null;
  if (hash === "test-shelf" || hash === "test-practice") {
    room.hidden = true;
    state = "away";
    lastStation = hash === "test-practice" ? "practice" : "learn";
    link.hidden = false;
    if (hash === "test-practice") SB.store.ready.then(function () { SB.jumpScene(1); });
  } else if (hash === "desk") {
    room.hidden = true;
    state = "away";
    lastStation = "apply";
    SB.desk.open({ instant: true });
  } else {
    room.hidden = false;
    release = ui.isolate([room]);
    safeFrame();
    if (station) {
      history.replaceState(null, "", location.pathname);
      SB.store.ready.then(function () { return enter(station); }).then(function () {
        if (bookId && state === "learn") openRoomBook(bookId);
      });
    }
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(safeFrame);

  SB.room = { state: function () { return state; }, enter: enter, back: backToRoom };
})();
