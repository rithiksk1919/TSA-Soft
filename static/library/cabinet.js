/* SkillBridge: the camera move between scenes, the card-catalog cabinet, its drawers, and the
   Flashcards fan. All physical motion comes from spring.js; data comes from SB.store.
   Flat mode (under 820px or reduced motion): no 3D camera or cabinet; drawers open as sheets. */
(function () {
  "use strict";

  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, store = SB.store;
  var $ = ui.$, $$ = ui.$$, esc = ui.esc, clamp = ui.clamp, lerp = ui.lerp, wait = ui.wait, announce = ui.announce;

  var el = {
    world: $("#world"), stage: $("#cam-stage"),
    sceneA: $("#scene-a"), sceneB: $("#scene-b"),
    headA: $("#intro"), headB: $("#intro-b"), h1A: $("#h-a"), h1B: $("#h-b"),
    toCab: $("#to-cabinet"), toShelf: $("#to-shelf"), segLearn: $("#seg-learn"), segPractice: $("#seg-practice"),
    rig: $("#cab-rig"), front: $("#cab-front"), drawers: $("#drawers"), scrim: $("#cab-scrim"),
    bar: $("#drawer-bar"), count: $("#drawer-count"), subjects: $("#subject-buttons"), close: $("#close-drawer"),
    trays: $("#drawer-trays"), reviewAll: $("#review-all"), hint: $("#drawer-hint")
  };

  /* =====================================================================
     Camera: p in [0, 1]; everything is derived from p and its velocity v
     ===================================================================== */

  var sw = 0;
  var cameraTarget = 0;
  var PEAK_V = 3.4;   // peak dp/dt of the camera preset over a full move

  var layerEls = { track: $("#track"), wall: $(".layer--wall"), floor: $(".layer--floor") };
  var cam = SB.createSpring(P.camera, function (p, v) {
    // Depth layers move at 0.6x / 1.0x / 1.12x of the scene width. Transforms are written on the
    // three layers directly: writing --p on the stage every frame restyled every element in both
    // scenes (custom properties inherit) and cost ~15% of the frame budget at 4x CPU throttling.
    // --p is still written once the move settles, so the CSS rules stay a correct resting state.
    layerEls.track.style.transform = "translateX(" + (-p * sw).toFixed(2) + "px)";
    layerEls.wall.style.transform = "translateX(" + (-0.6 * p * sw).toFixed(2) + "px)";
    layerEls.floor.style.transform = "translateX(" + (-1.12 * p * sw).toFixed(2) + "px)";
    if (v === 0) el.stage.style.setProperty("--p", p.toFixed(5));
    if (v === 0 || ui.flat()) {
      el.stage.style.transform = "";
    } else {
      var lean = -6 * clamp(v / 2, -1, 1);
      var pulse = 20 * clamp(Math.abs(v) / PEAK_V, 0, 1);
      el.stage.style.transform = "translateZ(" + pulse.toFixed(2) + "px) rotateY(" + lean.toFixed(3) + "deg)";
    }
    el.headA.style.opacity = clamp(1 - p, 0, 1).toFixed(3);
    el.headB.style.opacity = clamp(p, 0, 1).toFixed(3);
  }, 0);

  SB.atShelf = function () { return cameraTarget === 0 && !cam.moving(); };

  function syncSeg(t) {
    if (el.segLearn) el.segLearn.setAttribute("aria-pressed", String(t === 0));
    if (el.segPractice) el.segPractice.setAttribute("aria-pressed", String(t === 1));
  }

  function go(target) {
    if (SB.bookOpen && SB.bookOpen()) return;
    if (drawer.state !== "closed") return;
    if (target === cameraTarget && !cam.moving()) return;
    cameraTarget = target;
    syncSeg(target);
    // Both scenes are live while the camera moves, so the far arrow can reverse it.
    [el.sceneA, el.sceneB].forEach(function (n) { n.inert = false; n.style.visibility = "visible"; });
    [el.headA, el.headB].forEach(function (n) { n.style.visibility = "visible"; n.removeAttribute("aria-hidden"); });
    if (SB.reducedMotion()) {
      cam.jump(target);
      ui.fade(target === 1 ? el.sceneB : el.sceneA, 0, 1);
      ui.fade(target === 1 ? el.headB : el.headA, 0, 1);
      settleScene(target);
      return;
    }
    cam.to(target).then(function () {
      if (cameraTarget !== target || cam.moving()) return;
      settleScene(target);
    });
  }

  function settleScene(t) {
    var onB = t === 1;
    var off = onB ? el.sceneA : el.sceneB;
    var offHead = onB ? el.headA : el.headB;
    var onHead = onB ? el.headB : el.headA;
    off.inert = true;
    off.style.visibility = "hidden";
    offHead.style.visibility = "hidden";
    offHead.setAttribute("aria-hidden", "true");
    onHead.removeAttribute("aria-hidden");
    (onB ? el.h1B : el.h1A).focus({ preventScroll: true });
    announce(onB ? "Practice your mistakes" : "Learn your mistakes");
  }

  el.toCab.addEventListener("click", function () { go(1); });
  el.toShelf.addEventListener("click", function () { go(0); });
  if (el.segLearn) el.segLearn.addEventListener("click", function () { go(0); });
  if (el.segPractice) el.segPractice.addEventListener("click", function () { go(1); });
  SB.goScene = go;
  // Land in a scene with no camera move (the library room zooms in on top of it).
  SB.jumpScene = function (t) {
    cameraTarget = t;
    syncSeg(t);
    [el.sceneA, el.sceneB].forEach(function (n) { n.inert = false; n.style.visibility = "visible"; });
    [el.headA, el.headB].forEach(function (n) { n.style.visibility = "visible"; n.removeAttribute("aria-hidden"); });
    cam.jump(t);
    settleScene(t);
  };

  el.sceneB.inert = true;
  el.headB.setAttribute("aria-hidden", "true");
  syncSeg(0);

  /* =====================================================================
     Cabinet geometry
     ===================================================================== */

  var G = {};
  var drawerViews = [];

  function computeGeometry() {
    sw = el.world.clientWidth;
    el.stage.style.setProperty("--sw", sw + "px");
    var compact = sw < 640;
    var W = compact ? 340 : 760, H = compact ? 420 : 380, D = compact ? 190 : 220;
    var cols = compact ? 2 : 3, rows = compact ? 3 : 2;
    var pad = compact ? 16 : 22, gap = compact ? 10 : 12, base = 30;
    var dw = (W - 2 * pad - (cols - 1) * gap) / cols;
    var dh = (H - pad - base - (rows - 1) * gap) / rows;
    var floorY = el.world.clientHeight - 64;
    var fit = Math.min(1, (sw - 2 * 16) / (W + 16), (floorY - 40) / (H + 60));
    var openZ = compact ? 170 : 260;
    var mag = 1200 / (1200 - openZ - 70);   // magnification of the pulled drawer by the perspective
    G = { compact: compact, W: W, H: H, D: D, cols: cols, rows: rows, pad: pad, gap: gap, dw: dw, dh: dh, DD: D - 30, fit: fit, openZ: openZ, mag: mag };
    el.rig.style.setProperty("--cw", W + "px");
    el.rig.style.setProperty("--ch", H + "px");
    el.rig.style.setProperty("--cd", D + "px");
    el.stage.style.setProperty("--cab-vis-w", (W * fit).toFixed(1) + "px");
  }

  function drawerRect(i) {
    var col = i % G.cols, row = Math.floor(i / G.cols);
    return { x: G.pad + col * (G.dw + G.gap), y: G.pad + row * (G.dh + G.gap), w: G.dw, h: G.dh };
  }

  /* =====================================================================
     Drawers
     ===================================================================== */

  // closed | opening | groups | subject | panel | closing   (review sits on top of groups/subject/panel)
  var drawer = { state: "closed", view: null };

  function labelMeta(d) { return d.active ? store.countLabel(d.count) : "Soon"; }

  function holderHTML(d) {
    return '<span class="drawer__holder"><span class="drawer__card">' +
      '<span class="drawer__line"><span>' + esc(d.call) + '</span><span class="drawer__meta' + (d.active ? "" : " drawer__soon") + '">' + esc(labelMeta(d)) + "</span></span>" +
      '<span class="drawer__title">' + esc(d.title) + "</span>" +
      '<span class="drawer__sub">' + esc(d.sub) + "</span>" +
      "</span></span>";
  }
  function pullHTML(r) {
    var pw = Math.round(r.w * 0.3), py = Math.round(r.h * 0.74), px = Math.round((r.w - pw) / 2);
    return '<span class="pull">' +
      '<span class="pull__shadow" style="left:' + (px - 2) + "px;top:" + (py + 4) + "px;width:" + (pw + 4) + 'px;height:8px"></span>' +
      '<span class="pull__post" style="left:' + (px + 6) + "px;top:" + py + 'px;width:8px;height:8px;transform:translateZ(4px) rotateY(90deg)"></span>' +
      '<span class="pull__post" style="left:' + (px + pw - 14) + "px;top:" + py + 'px;width:8px;height:8px;transform:translateZ(4px) rotateY(90deg)"></span>' +
      '<span class="pull__under" style="left:' + px + "px;top:" + (py + 4) + "px;width:" + pw + 'px;height:8px;transform:translateZ(4px) rotateX(-90deg)"></span>' +
      '<span class="pull__bar" style="left:' + px + "px;top:" + py + "px;width:" + pw + 'px;height:8px;transform:translateZ(8px)"></span>' +
      "</span>";
  }

  function boxHTML(r) {
    var DD = G.DD, lip = 14;
    return '<span class="dbox dbox--side" style="left:' + (4 - DD / 2) + "px;top:" + lip + "px;width:" + DD + "px;height:" + (r.h - lip) + "px;transform:translateZ(" + (-DD / 2) + 'px) rotateY(90deg)"></span>' +
      '<span class="dbox dbox--side" style="left:' + (r.w - 4 - DD / 2) + "px;top:" + lip + "px;width:" + DD + "px;height:" + (r.h - lip) + "px;transform:translateZ(" + (-DD / 2) + 'px) rotateY(90deg)"></span>' +
      '<span class="dbox dbox--floor" style="left:4px;top:' + (r.h - 6 - DD / 2) + "px;width:" + (r.w - 8) + "px;height:" + DD + "px;transform:translateZ(" + (-DD / 2) + 'px) rotateX(90deg)"></span>' +
      '<span class="dbox dbox--back" style="left:4px;top:' + lip + "px;width:" + (r.w - 8) + "px;height:" + (r.h - lip) + "px;transform:translateZ(" + (-DD) + 'px)"></span>';
  }

  function buildCabinet() {
    computeGeometry();
    var ds = store.data.drawers;
    el.front.innerHTML = ds.map(function (d, i) {
      var r = drawerRect(i);
      return '<span class="cab__hole" style="left:' + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + 'px"></span>';
    }).join("");

    el.drawers.innerHTML = ds.map(function (d, i) {
      var r = drawerRect(i);
      return '<div class="dslot" data-i="' + i + '" data-id="' + esc(d.id) + '" style="left:' + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + 'px">' +
        boxHTML(r) +
        (d.id === "flashcards" ? '<div class="dcontents" id="dcontents"></div>' : '<div class="dcontents dcontents--' + esc(d.id) + '" aria-hidden="true"></div>') +
        '<button class="drawer" type="button" aria-expanded="false"' + (d.active ? ' aria-haspopup="dialog"' : ' aria-disabled="true"') + ">" + holderHTML(d) +
        '<span class="visually-hidden"> drawer' + (d.active ? "" : ", not available yet") + "</span></button>" +
        pullHTML(r) +
        (d.active ? "" : '<span class="dtip" aria-hidden="true">Not in this version</span>') +
        "</div>";
    }).join("");

    drawerViews = $$(".dslot", el.drawers).map(function (slot, i) {
      var v = { i: i, slot: slot, btn: $(".drawer", slot), tip: $(".dtip", slot), d: ds[i], hover: 0, shake: 0, open: 0 };
      v.render = function () {
        var z = ui.flat() ? 0 : 1 + v.hover * 10 + v.open * G.openZ;
        slot.style.transform = "translate3d(" + (v.shake * 3).toFixed(2) + "px,0," + z.toFixed(2) + "px)";
        slot.classList.toggle("is-hover", v.hover > 0.5 && drawer.state === "closed");
      };
      v.hoverS = SB.createSpring(P.drawerTravel, function (x) { v.hover = x; v.render(); }, 0);
      v.shakeS = SB.createSpring(P.stuck, function (x) { v.shake = x; v.render(); }, 0);
      v.openS = SB.createSpring(P.drawerTravel, function (x) { v.open = x; v.render(); renderRig(v); }, 0);
      v.render();
      bindDrawer(v);
      return v;
    });

    buildContents();
    buildBar();
    renderRig(null);
    updateCounts();
  }

  // SB.cabOverlay = { dx, dy, s }: places the cabinet over the 3D library room's catalog. It is applied
  // inside the rig's own transform (a 2D transform on an ancestor would break 3D hit-testing).
  var lastRigView = null;
  SB.renderCabinet = function () { renderRig(lastRigView); };
  SB.cabinetWidth = function () { return G.W * G.fit; };
  function renderRig(v) {
    lastRigView = v;
    var ov = SB.cabOverlay;
    var pre = ov ? "translate3d(" + ov.dx.toFixed(2) + "px," + ov.dy.toFixed(2) + "px,0) " : "";
    var k = ov ? ov.s : 1;
    var q = v ? clamp(v.open, -0.2, 1.2) : 0;
    if (ui.flat()) {
      el.rig.style.transform = pre + "scale(" + (G.fit * k).toFixed(4) + ")";
      el.scrim.style.opacity = "0";
      return;
    }
    var tx = 0, ty = 0;
    if (v) {
      var r = drawerRect(v.i);
      tx = -((r.x + r.w / 2) - G.W / 2) * q * G.fit;
      // The pitch carries the pulled drawer downward; lift it back, and lift lower rows to the
      // height of the top row so every drawer opens in view (not below the fold or the footer).
      ty = (-64 - (r.y - G.pad) * G.fit) * q;
    }
    var f = G.fit * k;
    el.rig.style.transform = pre +
      "translate3d(" + (tx * k).toFixed(2) + "px," + (ty * k).toFixed(2) + "px,0) scale3d(" + f.toFixed(4) + "," + f.toFixed(4) + "," + f.toFixed(4) + ") " +
      "rotateX(" + ((ov && typeof ov.rx === "number" ? ov.rx : -6) - 12 * q).toFixed(3) + "deg) rotateY(" + ((ov && typeof ov.ry === "number" ? ov.ry : -8) * (1 - clamp(q, 0, 1))).toFixed(3) + "deg)";
    el.scrim.style.opacity = (0.18 * clamp(q, 0, 1)).toFixed(3);
  }

  function bindDrawer(v) {
    var b = v.btn;
    function on() { if (v.d.active && drawer.state === "closed") v.hoverS.to(1); }
    function off() { if (drawer.state === "closed") v.hoverS.to(0); }
    b.addEventListener("pointerenter", on);
    b.addEventListener("pointerleave", function () { if (document.activeElement !== b) off(); });
    b.addEventListener("focus", on);
    b.addEventListener("blur", off);
    b.addEventListener("click", function () {
      if (!v.d.active) { stuck(v); return; }
      if (drawer.state === "closed" || (drawer.state === "closing" && drawer.view === v)) { openDrawer(v); return; }
      // Another drawer is still closing: open this one as soon as it is home.
      if (drawer.state === "closing" && drawer.closing) {
        var want = v;
        pendingOpen = want;
        drawer.closing.then(function () { if (pendingOpen === want && drawer.state === "closed") { pendingOpen = null; openDrawer(want); } });
      }
    });
  }

  var tipTimer = 0;
  function stuck(v) {
    v.shakeS.kick(28);   // about 4px of shake from the stuck preset
    drawerViews.forEach(function (o) { if (o.tip) o.tip.classList.remove("is-on"); });
    if (v.tip) v.tip.classList.add("is-on");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { if (v.tip) v.tip.classList.remove("is-on"); }, 1600);
    announce(v.d.title + " is not in this version.");
  }

  // Live counts on every label card and in the Flashcards bar.
  function updateCounts() {
    drawerViews.forEach(function (v) {
      var m = $(".drawer__meta", v.btn);
      if (m) m.textContent = labelMeta(v.d);
    });
    var filter = chosenSubject() ? { subject: chosenSubject() } : {};
    var counts = store.counts(filter);
    if (el.trays) el.trays.innerHTML = ui.trays(counts);
    if (el.count) el.count.textContent = "· " + store.countLabel("cards");
    if (el.reviewAll) el.reviewAll.textContent = "Review " + (chosenSubject() ? "All " + store.subject(chosenSubject()).name : "All") + " (" + counts.total + ")";
    items.forEach(function (it) {
      if (it.kind !== "card") return;
      var c = store.counts({ mistake: it.m.id });
      var s = $("[data-state]", it.el);
      if (s) s.textContent = c[3] ? c[3] + " learned" : c[2] ? c[2] + " learning" : "";
    });
  }
  store.on(updateCounts);

  /* =====================================================================
     Flashcards fan (desktop 3D): cards and dividers inside the drawer
     ===================================================================== */

  var items = [];
  var groups = [];
  var chosen = -1;
  function chosenSubject() { return chosen >= 0 && groups[chosen] ? groups[chosen].s.id : null; }

  function cardFace(m) {
    var n = m.cards.length;
    return '<span class="fcard__top"><span class="fcard__call">' + esc(m.call) + "</span><span>" + ui.plural(n, "card") + "</span></span>" +
      '<span class="fcard__title">' + esc(m.title) + "</span>" +
      '<span class="fcard__state" data-state></span>' +
      '<span class="fcard__go" aria-hidden="true">Review ' + n + " →</span>";
  }

  function buildContents() {
    var box = $("#dcontents");
    if (!box) return;
    var cw = G.dw - 16, ch = G.dh - 24;
    var html = "", list = [];
    var tabSpots = [0.04, 0.32, 0.6];
    store.subjects().forEach(function (s, g) {
      var ms = store.mistakes(s.id);
      list.push({ kind: "divider", g: g, s: s });
      html += '<button class="fitem fdivider" type="button" data-subject="' + s.id + '" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px">' +
        '<span class="fdivider__tab" style="left:' + Math.round(tabSpots[g % 3] * cw) + 'px">' + esc(s.name) + "</span>" +
        '<span class="fdivider__count">' + ui.plural(ms.length, "mistake") + "</span></button>";
      ms.forEach(function (m, k) {
        list.push({ kind: "card", g: g, s: s, m: m, k: k });
        html += '<button class="fitem fcard" type="button" data-subject="' + s.id + '" data-mistake="' + m.id + '" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px">' +
          '<span class="visually-hidden">' + esc(s.name) + ": </span>" + cardFace(m) + '<span class="visually-hidden">. Review ' + ui.plural(m.cards.length, "card") + "</span></button>";
      });
      for (var f = 0; f < 2; f++) {
        list.push({ kind: "filler", g: g, s: s });
        html += '<span class="fitem fcard fcard--filler" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px"></span>';
      }
    });
    box.innerHTML = html;
    var nodes = $$(".fitem", box);
    var n = list.length;
    items = list.map(function (it, i) {
      it.el = nodes[i];
      it.zIn = -14 - i * ((G.DD - 26) / (n - 1));
      it.home = { x: 0, y: 0, z: it.zIn, rx: 0, rz: 0 };
      it.from = it.home; it.to = it.home; it.bump = 0; it.cur = it.home;
      it.sp = SB.createSpring(P.pop, function (t) { renderItem(it, t); }, 1);
      renderItem(it, 1);
      return it;
    });
    groups = store.subjects().map(function (s, g) {
      return {
        s: s,
        divider: items.filter(function (x) { return x.g === g && x.kind === "divider"; })[0],
        cards: items.filter(function (x) { return x.g === g && x.kind === "card"; })
      };
    });
    items.forEach(function (it) {
      if (it.kind === "divider") it.el.addEventListener("click", function () { chooseSubject(it.g); });
      if (it.kind === "card") it.el.addEventListener("click", function () {
        if (drawer.state === "groups") chooseSubject(it.g);
        else if (drawer.state === "subject" && chosen === it.g) reviewMistake(it.m, it.el);
      });
    });
    setItemsReachable([]);
  }

  function poseAt(it, t) {
    var a = it.from, b = it.to;
    var p = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t) };
    if (it.bump) p.rx += it.bump * Math.sin(Math.PI * clamp(t, 0, 1.25));   // the pop: a tilt that settles
    return p;
  }
  function renderItem(it, t) {
    var p = poseAt(it, t);
    it.cur = p;
    it.el.style.transform = "translate3d(" + p.x.toFixed(2) + "px," + p.y.toFixed(2) + "px," + p.z.toFixed(2) + "px) rotateX(" + p.rx.toFixed(2) + "deg) rotateZ(" + p.rz.toFixed(2) + "deg)";
  }
  function moveItem(it, pose, bump) {
    it.from = it.cur; it.to = pose; it.bump = bump || 0;
    it.sp.jump(0);
    return it.sp.to(1);
  }

  var FACE = 18;   // the rig is pitched -18deg with a drawer open; cards counter-rotate to face the camera

  function halfRoom() { return (sw / 2 - 14) / (G.fit * G.mag * (SB.cabOverlay ? SB.cabOverlay.s : 1)); }
  function fanSpacing() { var cw = G.dw - 16; return clamp(halfRoom() - cw / 2, cw * 0.5, cw + 60); }

  function groupsPose(it) {
    var gr = groups[it.g];
    var stack = [gr.divider].concat(gr.cards);
    var j = stack.indexOf(it), n = stack.length;
    var step = G.compact ? 30 : 46;   // enough to show the call number and title above the card in front
    if (j < 0) return it.home;
    // Rising by `step` at the FACE pitch also brings a card step*sin(FACE) closer; step back more
    // than that, or the cards behind would sort in front of the one before them.
    var zStep = step * Math.sin(FACE * Math.PI / 180) + 8;
    return { x: (it.g - 1) * fanSpacing(), y: -(G.dh - 6) - j * step, z: 40 + (n - j) * zStep, rx: FACE, rz: (it.g - 1) * 4 + (j - (n - 1) / 2) * 1.1 };
  }
  function subjectPose(it) {
    if (it.g !== chosen || it.kind !== "card") return it.home;
    var gr = groups[chosen];
    var m = gr.cards.length, k = gr.cards.indexOf(it), c = (m - 1) / 2;
    var cw = G.dw - 16;
    var span = Math.max(0, Math.min(2 * (halfRoom() - cw / 2), (cw + 22) * (m - 1)));
    var stepX = m > 1 ? span / (m - 1) : 0;
    return { x: (k - c) * stepX, y: -(G.dh + 10) + Math.abs(k - c) * 10, z: 70 + k * 2, rx: FACE, rz: (k - c) * 3 };
  }

  // Card choreography: a new one supersedes starts still pending from the last (re-target, never stack).
  var chorSeq = 0;
  function choreograph(moves) {
    var my = ++chorSeq;
    // Promote the moving cards only while they move (measured +1.5 fps at 4x CPU throttling).
    moves.forEach(function (mv) { mv.it.el.style.willChange = "transform"; });
    return Promise.all(moves.map(function (mv) {
      return wait(mv.delay || 0).then(function () {
        if (my !== chorSeq) return;
        moveItem(mv.it, mv.pose, mv.bump || 0);
        return mv.it.sp.near(0.03);
      });
    })).then(function () {
      if (my === chorSeq) moves.forEach(function (mv) { mv.it.sp.near(0.0005).then(function () { if (!mv.it.sp.moving()) mv.it.el.style.willChange = ""; }); });
      return my === chorSeq;
    });
  }
  function staggerMoves(list, poseFn, gap, bump) {
    return list.map(function (it, i) { return { it: it, pose: poseFn(it), bump: bump, delay: i * gap }; });
  }
  function popOrder() {
    var out = [];
    groups.forEach(function (gr) { out.push(gr.divider); out = out.concat(gr.cards); });
    return out;
  }

  function setItemsReachable(focusable, clickable) {
    clickable = clickable || focusable;
    items.forEach(function (it) {
      if (it.kind === "filler") return;
      it.el.tabIndex = focusable.indexOf(it) >= 0 ? 0 : -1;
      it.el.disabled = clickable.indexOf(it) < 0;
    });
  }
  function dividers() { return groups.map(function (g) { return g.divider; }); }
  function groupItems() { return items.filter(function (it) { return it.kind !== "filler"; }); }

  function chooseSubject(g) {
    if (drawer.state !== "groups" && drawer.state !== "subject") return;
    chosen = g;
    drawer.state = "subject";
    syncBar();
    var gr = groups[g];
    setHint("Choose a mistake to review");
    var sinking = items.filter(function (it) { return it.g !== g && it.kind !== "filler"; }).concat([gr.divider]);
    var moves = staggerMoves(sinking.reverse(), function (it) { return it.home; }, 18, 0)
      .concat(staggerMoves(gr.cards, subjectPose, 35, -14));
    setItemsReachable(gr.cards);
    announce(gr.s.name + ": " + ui.plural(gr.cards.length, "mistake") + ". Choose one to review.");
    return choreograph(moves).then(function (current) {
      if (!current || chosen !== g || drawer.state !== "subject") return false;
      gr.cards[0].el.focus({ preventScroll: true });
      return true;
    });
  }

  function backToGroups() {
    drawer.state = "groups";
    chosen = -1;
    syncBar();
    setHint("Choose a subject");
    choreograph(staggerMoves(popOrder(), groupsPose, 20, 0));
    setItemsReachable(dividers(), groupItems());
    var first = $(".chip-btn", el.subjects);
    if (first) first.focus({ preventScroll: true });
  }

  function setHint(text) {
    el.hint.hidden = !text;
    el.hint.innerHTML = text ? "<span>" + esc(text) + "</span>" : "";
  }

  // The bar on the floor band: subject chips, trays, Review All, Close Drawer.
  function buildBar() {
    el.subjects.innerHTML = ui.chips(store.subjects(), null, { label: "Choose a subject" });
    $$(".chip-btn", el.subjects).forEach(function (b) {
      b.addEventListener("click", function () {
        var id = b.dataset.subject;
        if (!id) { if (drawer.state === "subject") backToGroups(); return; }
        var g = groups.map(function (x) { return x.s.id; }).indexOf(id);
        if (drawer.state === "subject" && chosen === g) { backToGroups(); return; }
        chooseSubject(g);
      });
    });
  }
  function syncBar() {
    $$(".chip-btn", el.subjects).forEach(function (b) {
      b.setAttribute("aria-pressed", String((b.dataset.subject || null) === chosenSubject()));
    });
    updateCounts();
  }
  el.reviewAll.addEventListener("click", function () {
    var sub = chosenSubject();
    reviewCards(store.cards(sub ? { subject: sub } : {}), sub ? "All " + store.subject(sub).name + " mistakes" : "All mistakes", el.reviewAll);
  });
  el.close.addEventListener("click", function () { requestClose(); });

  /* =====================================================================
     Review (shared overlay in review.js)
     ===================================================================== */

  function reviewCards(cards, title, fromEl) {
    if (!cards.length) return;
    var flyFrom = fromEl && fromEl.classList.contains("fitem") ? fromEl : null;
    SB.review.open({
      cards: cards, title: title, from: flyFrom,
      onExit: function () { if (fromEl && fromEl.isConnected) fromEl.focus({ preventScroll: true }); }
    });
  }
  function reviewMistake(m, fromEl) { reviewCards(store.cards({ mistake: m.id }), m.title, fromEl); }
  SB.reviewMistake = function (mistakeId, fromEl) { var m = store.mistake(mistakeId); if (m) reviewMistake(m, fromEl); };
  SB.reviewCards = reviewCards;

  /* =====================================================================
     Open / close: one choreography for every drawer
     ===================================================================== */

  // Open and close are sequences on one token: starting either supersedes the other, and the
  // springs are re-targeted from where they are (keeping velocity), never restarted or stacked.
  var seq = 0;
  var releaseTrap = null;
  var pendingOpen = null;

  function lockOthers(v, locked) {
    drawerViews.forEach(function (o) { if (o !== v) o.btn.tabIndex = locked ? -1 : 0; });
    el.toShelf.inert = locked;
    el.toShelf.style.opacity = locked ? "0" : "";
  }
  function usesFan(v) { return v.d.id === "flashcards" && !ui.flat(); }

  function openDrawer(v, opts) {
    opts = opts || {};
    if (drawer.view && drawer.view !== v) return Promise.resolve();
    if (drawer.state !== "closed" && drawer.state !== "closing") return Promise.resolve();
    var my = ++seq;
    var reopening = drawer.state === "closing";
    drawer.state = "opening";
    drawer.view = v;
    if (!reopening) chosen = -1;
    v.btn.setAttribute("aria-expanded", "true");
    v.hoverS.to(0);
    lockOthers(v, true);
    var flat = ui.flat();
    if (!usesFan(v) && !reopening && !flat && SB.interiors) SB.interiors.build(v.d.id, $(".dcontents", v.slot), G);
    var slid = flat ? Promise.resolve() : (v.openS.to(1), v.openS.near(0.03).then(function () { return my === seq && wait(250); }));
    return slid.then(function () {
      if (my !== seq) return;
      if (usesFan(v)) {
        return choreograph(staggerMoves(popOrder(), groupsPose, 35, -26)).then(function () {
          if (my !== seq) return;
          drawer.state = "groups";
          syncBar();
          el.bar.hidden = false;
          setHint("Choose a subject");
          setItemsReachable(dividers(), groupItems());
          if (releaseTrap) releaseTrap();
          releaseTrap = ui.isolate([v.slot, el.bar, el.hint]);
          announce("Flashcards drawer open. " + store.countLabel("cards") + " in " + groups.length + " subjects. Choose a subject.");
          // Arrived from another drawer with a mistake in hand: go straight to its cards.
          if (opts.mistake) {
            var mm = store.mistake(opts.mistake);
            var g = groups.map(function (x) { return x.s.id; }).indexOf(mm.subject);
            return chooseSubject(g).then(function (ok) {
              if (!ok || my !== seq) return;
              var it = items.filter(function (x) { return x.m && x.m.id === mm.id; })[0];
              reviewMistake(mm, it ? it.el : null);
            });
          }
          var first = $(".chip-btn", el.subjects);
          if (first) first.focus({ preventScroll: true });
        });
      }
      var contents = SB.drawerContents && SB.drawerContents[v.d.id];
      if (!contents) return;
      // Re-opened mid-close: the panel still holds its contents; bring it back as it is.
      if (reopening && SB.panel.id() === v.d.id) {
        drawer.state = "panel";
        return SB.panel.open({ id: v.d.id, onCloseRequest: requestClose }).then(function () {
          if (my === seq) announce(v.d.title + " drawer open.");
        });
      }
      // The drawer's own motion plays first, in full view; the panel then opens over the room.
      var signature = SB.interiors && !flat ? Promise.race([SB.interiors.play(v.d.id), wait(1700)]) : Promise.resolve();
      return signature.then(function () {
        if (my !== seq) return;
        drawer.state = "panel";
        return openPanel();
      });
      function openPanel() { return SB.panel.open({
        id: v.d.id, call: v.d.call, title: v.d.title, sub: v.d.sub,
        render: function (body, api) { contents.render(body, api, opts); },
        onCloseRequest: requestClose
      }).then(function () {
        if (my !== seq) return;
        announce(v.d.title + " drawer open.");
        if (opts.mistake && v.d.id === "flashcards") {
          var mm = store.mistake(opts.mistake);
          reviewCards(store.cards({ mistake: mm.id }), mm.title, $('#sheet [data-review="' + mm.id + '"]'));
        }
      }); }
    });
  }

  // Close: contents drop back in (reverse stagger), then the drawer springs home against its stop,
  // and only then do the state flags change. Nothing is hidden or re-rendered during the motion.
  function closeDrawer() {
    var v = drawer.view;
    if (!v || drawer.state === "closing" || drawer.state === "closed") return Promise.resolve();
    if (SB.review.isOpen()) return SB.review.exit().then(closeDrawer);
    var my = ++seq;
    var wasPanel = drawer.state === "panel" || SB.panel.isOpen();
    drawer.state = "closing";
    if (releaseTrap) { releaseTrap(); releaseTrap = null; }
    el.bar.hidden = true;
    setHint("");
    setItemsReachable([]);
    var dropped = usesFan(v)
      ? choreograph(staggerMoves(popOrder().reverse(), function (it) { return it.home; }, 22, 0))
      : (wasPanel ? SB.panel.close() : Promise.resolve()).then(function () {
          if (my === seq && SB.interiors) return SB.interiors.reset(v.d.id);
        });
    var done = dropped.then(function () {
      if (my !== seq) return;
      return ui.flat() ? null : v.openS.to(0);
    }).then(function () {
      if (my !== seq) return;
      drawer.state = "closed";
      drawer.view = null;
      chosen = -1;
      v.btn.setAttribute("aria-expanded", "false");
      lockOthers(v, false);
      if (!pendingOpen) v.btn.focus({ preventScroll: true });
      announce(v.d.title + " drawer closed.");
    });
    drawer.closing = done;
    return done;
  }
  function requestClose() { return closeDrawer(); }

  // Open a drawer by id (used across drawers: "Review these cards", "Open the book").
  SB.openDrawer = function (id, opts) {
    var v = drawerViews.filter(function (x) { return x.d.id === id; })[0];
    if (!v) return Promise.resolve();
    var go = function () { return openDrawer(v, opts); };
    if (drawer.view && drawer.view !== v) return closeDrawer().then(go);
    return go();
  };
  SB.closeDrawer = closeDrawer;

  /* =====================================================================
     Keys, resize, debug, boot
     ===================================================================== */

  // One Esc router for the page (the open book handles its own Esc in library.js).
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (SB.bookOpen && SB.bookOpen()) return;
    if (SB.review.isOpen()) { e.preventDefault(); SB.review.exit(); return; }
    if (drawer.state === "panel") { e.preventDefault(); if (!SB.panel.back()) closeDrawer(); return; }
    if (drawer.state === "subject") { e.preventDefault(); backToGroups(); return; }
    if (drawer.state === "groups" || drawer.state === "opening") { e.preventDefault(); closeDrawer(); }
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      sw = el.world.clientWidth;
      el.stage.style.setProperty("--sw", sw + "px");
      cam.jump(cam.x);   // re-place the layers for the new width
      if (!store.data.drawers || drawer.state !== "closed") return;
      buildCabinet();
    }, 120);
  });

  SB.debug = {
    scene: function () { return cameraTarget; },
    p: function () { return cam.x; },
    drawer: function () { return drawer.state; },
    drawerId: function () { return drawer.view ? drawer.view.d.id : null; },
    panel: function () { return SB.panel.id(); },
    review: function () { return SB.review.isOpen(); },
    idle: function () { return SB.activeSprings() === 0; }
  };

  computeGeometry();
  store.ready.then(buildCabinet).catch(function (err) {
    el.hint.hidden = false;
    el.hint.innerHTML = "<span>Couldn’t load the cabinet data. Serve this folder over http.</span>";
    if (window.console) console.info(err);
  });
})();
