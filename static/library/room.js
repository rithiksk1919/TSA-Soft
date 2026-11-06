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
  var link = $("#to-room"), note = $("#desk-note"), backBtn = $("#desk-back");

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

  // Deterministic pseudo-random numbers: the room looks the same on every visit.
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  /* =====================================================================
     The room: 2000 wide, 1500 deep, 1000 high; floor at y = 0, back wall at z = -800
     ===================================================================== */

  var W = 2000, D = 1500, H = 1000, BACK = -800, FRONT = 700, MIDZ = (BACK + FRONT) / 2;

  function buildShell() {
    var s = group(world, "shell");
    plane(s, { cls: "floor", x: 0, y: 0, z: MIDZ, w: W, h: D, rx: 90 });
    plane(s, { cls: "rug", x: 40, y: -1, z: -170, w: 760, h: 470, rx: 90, html: '<span class="rug__border"></span>' });
    plane(s, { cls: "light-patch", x: -60, y: -2, z: -470, w: 300, h: 520, rx: 90, rz: -10 });
    plane(s, { cls: "wall wall--back", x: 0, y: -H / 2, z: BACK, w: W, h: H });
    plane(s, { cls: "wall wall--side", x: -W / 2, y: -H / 2, z: MIDZ, w: D, h: H, ry: 90 });
    plane(s, { cls: "wall wall--side wall--right", x: W / 2, y: -H / 2, z: MIDZ, w: D, h: H, ry: -90 });
    plane(s, { cls: "ceiling", x: 0, y: -H, z: MIDZ, w: W, h: D, rx: -90 });
    plane(s, { cls: "wainscot", x: 0, y: -150, z: BACK + 1, w: W, h: 300 });
    plane(s, { cls: "wainscot", x: -W / 2 + 1, y: -150, z: MIDZ, w: D, h: 300, ry: 90 });
    plane(s, { cls: "wainscot wainscot--right", x: W / 2 - 1, y: -150, z: MIDZ, w: D, h: 300, ry: -90 });
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
    plane(s, { cls: "frame", x: -W / 2 + 4, y: -580, z: -160, w: 380, h: 240, ry: 90, html: periodic() });
    plane(s, { cls: "frame", x: W / 2 - 4, y: -580, z: -300, w: 320, h: 220, ry: -90, html: circuit() });
    plane(s, { cls: "frame", x: W / 2 - 4, y: -580, z: 120, w: 220, h: 220, ry: -90, html: cellDiagram() });
    // Pendant lamps
    [-420, 420].forEach(function (x) {
      box(s, { cls: "cord", x: x, y: -770, z: -300, w: 3, h: 230, d: 3, faces: "front right" });
      box(s, { cls: "pendant", x: x, y: -730, z: -300, w: 90, h: 44, d: 90, faces: "front left right bottom" });
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
      if (i > 0) box(g, { cls: "wood", x: x0, y: -sy, z: z0, w: w - 48, h: 14, d: d - 8, faces: "front top" });
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
    plane(g, { cls: "plaque", x: x0 - 60, y: -h - 56, z: z0 + 60, w: 220, h: 50, html: '<span class="plaque__verb">Learn</span><span class="plaque__name">The bookshelf</span>' });
  }

  function fillShelf(g, xa, xb, yBase, z, space, shelfIndex) {
    var x = xa;
    var special = shelfIndex === 2 ? [{ c: "#2D4A6E", t: "Physics", h: 0.92 }, { c: "#7B3F36", t: "Chemistry", h: 0.84 }, { c: "#2F5B47", t: "Biology", h: 0.88 }] : [];
    var placed = 0;
    while (x < xb - 14) {
      var sp = special.length && placed >= 4 ? special.shift() : null;
      var bw = sp ? 32 : 14 + Math.round(rnd() * 16);
      if (x + bw > xb) break;
      var bh = Math.round(space * (sp ? sp.h : 0.6 + rnd() * 0.34));
      var col = sp ? sp.c : BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)];
      var b = box(g, { cls: "book3" + (sp ? " book3--subject" : ""), x: x + bw / 2, y: yBase, z: z, w: bw, h: bh, d: 92, faces: "front right top",
        html: { front: '<span class="book3__band"></span>' + (sp ? '<span class="book3__t">' + sp.t + "</span>" : "") } });
      b.style.setProperty("--c", col);
      x += bw + (rnd() < 0.12 ? 10 : 1);
      placed++;
      if (rnd() < 0.06 && x < xb - 80) {   // a book lying flat
        var f = box(g, { cls: "book3", x: x + 36, y: yBase, z: z, w: 68, h: 18, d: 92, faces: "front right top" });
        f.style.setProperty("--c", BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]);
        x += 76;
      }
    }
  }

  /* ---------- Apply: the reading desk ---------- */

  function buildDesk() {
    var x0 = 30, z0 = -250;
    var g = group(world, "station3 station3--desk", { "data-station": "apply" });
    box(g, { cls: "wood wood--warm", x: x0, y: -200, z: z0, w: 460, h: 26, d: 230, faces: "front top left right" });
    [[-210, -95], [210, -95], [-210, 95], [210, 95]].forEach(function (p) { box(g, { cls: "wood wood--warm", x: x0 + p[0], y: 0, z: z0 + p[1], w: 20, h: 200, d: 20, faces: "front left right" }); });
    box(g, { cls: "wood wood--warm", x: x0, y: -150, z: z0 + 104, w: 400, h: 50, d: 8, faces: "front" });
    box(g, { cls: "brass", x: x0, y: -168, z: z0 + 109, w: 50, h: 6, d: 4, faces: "front top" });
    // Lamp and its pool of light
    plane(g, { cls: "lamp-pool", x: x0 - 70, y: -227, z: z0 - 10, w: 280, h: 180, rx: 90 });
    box(g, { cls: "brass", x: x0 - 160, y: -226, z: z0 - 60, w: 56, h: 10, d: 44, faces: "front top left right" });
    box(g, { cls: "brass brass--dark", x: x0 - 160, y: -236, z: z0 - 60, w: 6, h: 150, d: 6, faces: "front right" });
    box(g, { cls: "lamp-shade", x: x0 - 140, y: -372, z: z0 - 50, w: 96, h: 40, d: 56, rz: 12, faces: "front left right top bottom" });
    // The open notebook: what Apply will be
    plane(g, { cls: "page3", x: x0 - 22, y: -228, z: z0 + 12, w: 124, h: 164, rx: 90, rz: -4, html: '<span class="nb__h">Find the wrong step</span><span class="nb__l">N = mg</span><span class="nb__l nb__l--x">N = mg cos 30°</span><span class="nb__l">= 17.0 N</span>' });
    plane(g, { cls: "page3", x: x0 + 102, y: -228, z: z0 + 20, w: 124, h: 164, rx: 90, rz: -4, html: '<span class="nb__h">Coming next</span><span class="nb__p">Solve a real scenario here, step by step.</span>' });
    box(g, { cls: "pencil", x: x0 + 184, y: -228, z: z0 + 34, w: 110, h: 5, d: 5, ry: 30, faces: "front top" });
    [["#3E4A57", 0], ["#7B3F36", 5], ["#8C7B64", -4]].forEach(function (b, i) {
      box(g, { cls: "book3", x: x0 + 172 + b[1], y: -226 - i * 22, z: z0 - 64, w: 120, h: 22, d: 84, ry: b[1] * 2, faces: "front right top" }).style.setProperty("--c", b[0]);
    });
    // The chair
    var cx = x0 - 10, cz = z0 + 190;
    box(g, { cls: "wood wood--warm", x: cx, y: -120, z: cz, w: 160, h: 16, d: 140, faces: "front top left right" });
    box(g, { cls: "wood wood--warm", x: cx, y: -136, z: cz + 64, w: 160, h: 170, d: 12, faces: "front back left right top" });
    [[-70, -60], [70, -60], [-70, 60], [70, 60]].forEach(function (p) { box(g, { cls: "wood wood--warm", x: cx + p[0], y: 0, z: cz + p[1], w: 12, h: 120, d: 12, faces: "front left right" }); });
    plane(g, { cls: "plaque", x: x0 + 20, y: -470, z: z0 - 60, w: 220, h: 50, html: '<span class="plaque__verb">Apply</span><span class="plaque__name">The reading desk</span>' });
  }

  /* ---------- Practice: the card catalog ---------- */

  function buildCatalog() {
    var x0 = 560, z0 = BACK + 120, w = 520, h = 300, d = 200, lift = 90;
    var g = group(world, "station3 station3--catalog", { "data-station": "practice" });
    box(g, { cls: "wood wood--dark", x: x0, y: -lift + 20, z: z0, w: w - 20, h: 20, d: d - 20, faces: "front top" });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) { box(g, { cls: "wood wood--dark", x: x0 + s[0] * (w / 2 - 30), y: 0, z: z0 + s[1] * (d / 2 - 30), w: 18, h: lift, d: 18, faces: "front left right" }); });
    var labels = ["FC 01", "MI 02", "WE 03", "DG 04", "HI 05", "LE 06"], drawers = "";
    labels.forEach(function (l) { drawers += '<span class="cat__d"><span class="cat__l">' + l + '</span><span class="cat__p"></span></span>'; });
    box(g, { cls: "cabinet3", x: x0, y: -lift, z: z0, w: w, h: h, d: d, faces: "front top left right", html: { front: '<span class="cat__grid">' + drawers + "</span>" } });
    box(g, { cls: "cabinet3", x: x0, y: -lift - h, z: z0 + 4, w: w + 20, h: 14, d: d + 10, faces: "front top left right" });
    box(g, { cls: "wood", x: x0 - 130, y: -lift - h - 14, z: z0, w: 120, h: 20, d: 80, faces: "front top left right" });
    for (var c = 0; c < 6; c++) plane(g, { cls: "card3", x: x0 - 130, y: -lift - h - 50, z: z0 - 28 + c * 10, w: 108, h: 56, rx: -8 });
    plane(g, { cls: "plaque", x: x0 + 40, y: -lift - h - 110, z: z0 + 60, w: 220, h: 50, html: '<span class="plaque__verb">Practice</span><span class="plaque__name">The card catalog</span>' });
    // The plant in the corner
    var pl = group(world, "plant", null, "translate3d(" + px(W / 2 - 130) + ",0," + px(BACK + 150) + ")");
    box(pl, { cls: "pot", x: 0, y: 0, z: 0, w: 96, h: 110, d: 96, faces: "front left right top" });
    for (var k = 0; k < 9; k++) plane(pl, { cls: "leaf", x: 0, y: -200 - (k % 3) * 40, z: 0, w: 70, h: 200, ry: k * 40, rz: (k % 2 ? 1 : -1) * (10 + k * 3) });
  }

  /* =====================================================================
     Camera: a pose (position, yaw, pitch); the world moves by the inverse
     ===================================================================== */

  var PERSPECTIVE = 900;
  var POSES = {
    overview: { x: 0, y: -440, z: 1020, yaw: 0, pitch: -10 },
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
    cam.style.transform = "translateZ(" + PERSPECTIVE + "px) rotateX(" + pitch.toFixed(3) + "deg) rotateY(" + yaw.toFixed(3) + "deg) translate3d(" +
      (-pose.x).toFixed(2) + "px," + (-pose.y).toFixed(2) + "px," + (-pose.z).toFixed(2) + "px)";
  }
  var fly = SB.createSpring(P.camera, function (k) {
    var p = {};
    for (var key in to) p[key] = lerp(from[key], to[key], k);
    pose = p;
    applyCamera();
  }, 1);
  function flyTo(name) {
    from = Object.assign({}, pose);
    to = Object.assign({}, POSES[name]);
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

  function busy() { return (SB.bookOpen && SB.bookOpen()) || (SB.debug && SB.debug.drawer() !== "closed"); }

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
      flyTo("apply").then(function () {
        state = "desk";
        note.hidden = false;
        backBtn.focus({ preventScroll: true });
        ui.announce("The reading desk. Coming next: solve a real scenario here, step by step.");
      });
      return;
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

  function leaveDesk() {
    if (state !== "desk") return;
    note.hidden = true;
    state = "flying";
    flyTo("overview").then(function () {
      state = "overview";
      highlight(null);
      var b = $('.rnav__btn[data-station="apply"]', room);
      if (b) b.focus({ preventScroll: true });
    });
  }

  function backToRoom() {
    if (busy() || state !== "away") return;
    var name = lastStation || (SB.debug.scene() === 1 ? "practice" : "learn");
    pose = Object.assign({}, POSES[name]);
    look.yaw = look.pitch = look.ty = look.tp = 0;
    applyCamera();
    room.hidden = false;
    room.style.opacity = "0";
    link.hidden = true;
    release = ui.isolate([room]);
    history.replaceState(null, "", location.pathname);
    state = "flying";
    crossfade(room, 0, 1, 220).then(function () { return flyTo("overview"); }).then(function () {
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
  backBtn.addEventListener("click", leaveDesk);
  link.addEventListener("click", backToRoom);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (state === "desk") { e.preventDefault(); leaveDesk(); return; }
    if (state === "away" && !busy() && !SB.review.isOpen() && !(SB.panel && SB.panel.isOpen())) backToRoom();
  });

  // The wall clock keeps real time.
  function tick() {
    var d = new Date(), s = d.getSeconds(), m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    var set = function (sel, deg) { var n = $(sel, world); if (n) n.style.transform = "rotate(" + deg.toFixed(1) + "deg)"; };
    set(".clock__h", h * 30); set(".clock__m", m * 6); set(".clock__s", s * 6);
  }

  // Narrow viewports pull the camera back so the whole room stays in frame.
  function fit() {
    var narrow = innerWidth < 820;
    POSES.overview = narrow
      ? { x: 0, y: -560, z: 2100, yaw: 0, pitch: -12 }
      : { x: 0, y: -440, z: 1020 + Math.max(0, 1300 - innerWidth) * 0.7, yaw: 0, pitch: -10 };
    if (state === "overview" && !fly.moving()) { pose = Object.assign({}, POSES.overview); applyCamera(); }
  }

  buildShell();
  buildBookcase();
  buildDesk();
  buildCatalog();
  fit();
  tick();
  setInterval(tick, 1000);
  window.addEventListener("resize", fit);

  // Boot: deep links skip the room.
  var hash = location.hash.slice(1);
  if (hash === "shelf" || hash === "practice") {
    room.hidden = true;
    state = "away";
    lastStation = hash === "practice" ? "practice" : "learn";
    link.hidden = false;
    if (hash === "practice") SB.store.ready.then(function () { SB.jumpScene(1); });
  } else {
    room.hidden = false;
    release = ui.isolate([room]);
  }

  SB.room = { state: function () { return state; }, enter: enter, back: backToRoom };
})();
