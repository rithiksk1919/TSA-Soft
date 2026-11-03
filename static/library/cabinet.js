/* SkillBridge: the camera move between scenes, the card-catalog cabinet, and the flashcards
   drawer. All motion comes from the springs in spring.js; data comes from data/flashcards.json. */
(function () {
  "use strict";

  var SB = window.SkillBridge;
  var P = SB.PRESETS;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, SB.reducedMotion() ? 0 : ms); }); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var el = {
    world: $("#world"), stage: $("#cam-stage"),
    sceneA: $("#scene-a"), sceneB: $("#scene-b"),
    headA: $("#intro"), headB: $("#intro-b"), h1A: $("#h-a"), h1B: $("#h-b"),
    toCab: $("#to-cabinet"), toShelf: $("#to-shelf"),
    rig: $("#cab-rig"), front: $("#cab-front"), drawers: $("#drawers"), scrim: $("#cab-scrim"),
    bar: $("#drawer-bar"), count: $("#drawer-count"), subjects: $("#subject-buttons"), close: $("#close-drawer"),
    hint: $("#drawer-hint"),
    review: $("#review"), rscrim: $("#review-scrim"), fly: $("#rcard-fly"), rcard: $("#rcard"),
    rfront: $("#rcard-front"), rback: $("#rcard-back"), rprogress: $("#review-progress"), ractions: $("#review-actions"),
    announcer: $("#announcer")
  };

  function announce(msg) {
    el.announcer.textContent = "";
    setTimeout(function () { el.announcer.textContent = msg; }, 30);
  }

  /* =====================================================================
     Camera: p in [0, 1], everything derived from p and its velocity v
     ===================================================================== */

  var sw = 0;
  var cameraTarget = 0;
  var PEAK_V = 3.4;   // peak dp/dt of the camera preset over a full move

  var cam = SB.createSpring(P.camera, function (p, v) {
    el.stage.style.setProperty("--p", p.toFixed(5));
    if (v === 0) {
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

  // Read-only view of the page state, for tests and debugging.
  SB.debug = {
    scene: function () { return cameraTarget; },
    p: function () { return cam.x; },
    drawer: function () { return drawer.state; },
    idle: function () { return SB.activeSprings() === 0; }
  };

  function go(target) {
    if (SB.bookOpen && SB.bookOpen()) return;
    if (drawer.state !== "closed") return;
    cameraTarget = target;
    // Both scenes are live while the camera moves, so the far arrow can reverse it.
    [el.sceneA, el.sceneB].forEach(function (n) { n.inert = false; n.style.visibility = "visible"; });
    [el.headA, el.headB].forEach(function (n) { n.style.visibility = "visible"; n.removeAttribute("aria-hidden"); });
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

  // Initial state: on the shelf, the cabinet scene out of reach.
  el.sceneB.inert = true;
  el.headB.setAttribute("aria-hidden", "true");

  /* =====================================================================
     Cabinet geometry
     ===================================================================== */

  var data = null;
  var G = {};      // geometry of the current layout
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
    var worldH = el.world.clientHeight;
    var floorY = worldH - 64;
    var fit = Math.min(1, (sw - 2 * 24) / (W + 24), (floorY - 40) / (H + 60));
    var openZ = compact ? 170 : 260;
    // How much the pulled-out drawer and its cards are magnified by the 1200px perspective.
    var mag = 1200 / (1200 - openZ - 70);
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

  var drawer = { state: "closed", view: null };   // closed | opening | groups | subject | review | closing

  function holderHTML(d, total) {
    var meta = d.active ? total + " cards" : "Soon";
    return '<span class="drawer__holder"><span class="drawer__card">' +
      '<span class="drawer__line"><span>' + esc(d.call) + '</span><span class="' + (d.active ? "" : "drawer__soon") + '">' + esc(meta) + "</span></span>" +
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
    var total = data.subjects.reduce(function (a, s) {
      return a + s.mistakes.reduce(function (b, m) { return b + m.cards.length; }, 0);
    }, 0);
    data.total = total;

    el.front.innerHTML = data.drawers.map(function (d, i) {
      var r = drawerRect(i);
      return '<span class="cab__hole" style="left:' + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + 'px"></span>';
    }).join("");

    el.drawers.innerHTML = data.drawers.map(function (d, i) {
      var r = drawerRect(i);
      var label = d.active
        ? d.title + " drawer. " + d.sub + ". " + total + " cards."
        : d.title + " drawer. Not available yet.";
      return '<div class="dslot" data-i="' + i + '" style="left:' + r.x + "px;top:" + r.y + "px;width:" + r.w + "px;height:" + r.h + 'px">' +
        boxHTML(r) +
        (d.active ? '<div class="dcontents" id="dcontents"></div>' : "") +
        '<button class="drawer" type="button" aria-label="' + esc(label) + '" aria-expanded="false"' + (d.active ? "" : ' aria-disabled="true"') + ">" + holderHTML(d, total) + "</button>" +
        pullHTML(r) +
        '<span class="dtip" aria-hidden="true">Not in this version</span>' +
        "</div>";
    }).join("");

    drawerViews = $$(".dslot", el.drawers).map(function (slot, i) {
      var v = { i: i, slot: slot, btn: $(".drawer", slot), tip: $(".dtip", slot), d: data.drawers[i], hover: 0, shake: 0, open: 0 };
      v.render = function () {
        slot.style.transform = "translate3d(" + (v.shake * 3).toFixed(2) + "px,0," + (1 + v.hover * 10 + v.open * G.openZ).toFixed(2) + "px)";
        slot.classList.toggle("is-hover", v.hover > 0.5 && drawer.state === "closed");
      };
      v.hoverS = SB.createSpring(P.drawerTravel, function (x) { v.hover = x; v.render(); }, 0);
      v.shakeS = SB.createSpring(P.stuck, function (x) { v.shake = x; v.render(); }, 0);
      v.openS = SB.createSpring(P.drawerTravel, function (x) { v.open = x; v.render(); renderRig(v); }, 0);
      v.render();
      bindDrawer(v);
      return v;
    });

    el.count.textContent = "· " + total + " cards";
    buildContents();
    buildSubjectButtons();
    renderRig(null);
  }

  function renderRig(v) {
    var q = v ? clamp(v.open, -0.2, 1.2) : 0;
    var tx = 0, ty = 0;
    if (v) {
      var r = drawerRect(v.i);
      tx = -((r.x + r.w / 2) - G.W / 2) * q * G.fit;
      ty = -64 * q;          // the pitch carries the pulled drawer downward; lift it back
    }
    el.rig.style.transform =
      "translate3d(" + tx.toFixed(2) + "px," + ty.toFixed(2) + "px,0) scale3d(" + G.fit.toFixed(4) + "," + G.fit.toFixed(4) + "," + G.fit.toFixed(4) + ") " +
      "rotateX(" + (-6 - 12 * q).toFixed(3) + "deg) rotateY(" + (-8 * (1 - clamp(q, 0, 1))).toFixed(3) + "deg)";
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
      if (drawer.state === "closed" || (drawer.state === "closing" && drawer.view === v)) openDrawer(v);
    });
  }

  var tipTimer = 0;
  function stuck(v) {
    v.shakeS.kick(28);   // about 4px of shake from the stuck preset
    drawerViews.forEach(function (o) { o.tip.classList.remove("is-on"); });
    v.tip.classList.add("is-on");
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () { v.tip.classList.remove("is-on"); }, 1600);
    announce(v.d.title + " is not in this version.");
  }

  /* =====================================================================
     Flashcards: items inside the drawer, and their poses
     ===================================================================== */

  var items = [];       // every card and divider plane in the flashcards drawer
  var groups = [];      // per subject: { s, divider, cards: [mistake items] }
  var chosen = -1;      // index of the chosen subject group
  var progress = {};    // mistake id -> { done, again }

  function cardFace(s, m) {
    return '<span class="fcard__top"><span class="fcard__call">' + esc(m.call) + "</span><span>" + m.cards.length + (m.cards.length === 1 ? " card" : " cards") + "</span></span>" +
      '<span class="fcard__title">' + esc(m.title) + "</span>" +
      '<span class="fcard__state" data-state></span>' +
      '<span class="fcard__go" aria-hidden="true">Review →</span>';
  }

  function buildContents() {
    var box = $("#dcontents");
    var cw = G.dw - 16, ch = G.dh - 24;
    var html = "", list = [];
    var tabSpots = [0.04, 0.32, 0.6];
    data.subjects.forEach(function (s, g) {
      var mistakeCount = s.mistakes.length;
      list.push({ kind: "divider", g: g, s: s });
      html += '<button class="fitem fdivider" type="button" data-k="' + list.length + '" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px" aria-label="' + esc(s.name + ", " + mistakeCount + " mistakes") + '">' +
        '<span class="fdivider__tab" style="left:' + Math.round(tabSpots[g % 3] * cw) + 'px">' + esc(s.name) + "</span>" +
        '<span class="fdivider__count">' + mistakeCount + " mistakes</span></button>";
      s.mistakes.forEach(function (m, k) {
        list.push({ kind: "card", g: g, s: s, m: m, k: k });
        html += '<button class="fitem fcard" type="button" data-k="' + list.length + '" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px" aria-label="' + esc(s.name + ": " + m.title + ", " + m.cards.length + (m.cards.length === 1 ? " card" : " cards")) + '">' + cardFace(s, m) + "</button>";
      });
      for (var f = 0; f < 2; f++) {
        list.push({ kind: "filler", g: g, s: s });
        html += '<span class="fitem fcard fcard--filler" data-k="' + list.length + '" style="--sub:' + s.accent + ";width:" + cw + "px;height:" + ch + 'px;left:8px;top:18px"></span>';
      }
    });
    box.innerHTML = html;
    var nodes = $$(".fitem", box);
    var n = list.length;
    items = list.map(function (it, i) {
      it.el = nodes[i];
      // In the drawer: standing upright, front to back.
      it.zIn = -14 - i * ((G.DD - 26) / (n - 1));
      it.home = { x: 0, y: 0, z: it.zIn, rx: 0, rz: 0 };
      it.from = it.home; it.to = it.home; it.bump = 0;
      it.cur = it.home;
      it.sp = SB.createSpring(P.pop, function (t) { renderItem(it, t); }, 1);
      renderItem(it, 1);
      return it;
    });
    groups = data.subjects.map(function (s, g) {
      return {
        s: s,
        divider: items.filter(function (x) { return x.g === g && x.kind === "divider"; })[0],
        cards: items.filter(function (x) { return x.g === g && x.kind === "card"; }),
        fillers: items.filter(function (x) { return x.g === g && x.kind === "filler"; })
      };
    });
    items.forEach(function (it) {
      if (it.kind === "divider") it.el.addEventListener("click", function () { chooseSubject(it.g); });
      if (it.kind === "card") it.el.addEventListener("click", function () {
        if (drawer.state === "groups") chooseSubject(it.g);
        else if (drawer.state === "subject" && chosen === it.g) startReview(it);
      });
    });
    setItemsReachable([]);
  }

  function poseAt(it, t) {
    var a = it.from, b = it.to;
    var p = {
      x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t),
      rx: lerp(a.rx, b.rx, t), rz: lerp(a.rz, b.rz, t)
    };
    // The pop: a tilt that peaks mid-flight and settles to the pose's own angle.
    if (it.bump) p.rx += it.bump * Math.sin(Math.PI * clamp(t, 0, 1.25));
    return p;
  }
  function renderItem(it, t) {
    var p = poseAt(it, t);
    it.cur = p;
    it.el.style.transform = "translate3d(" + p.x.toFixed(2) + "px," + p.y.toFixed(2) + "px," + p.z.toFixed(2) + "px) rotateX(" + p.rx.toFixed(2) + "deg) rotateZ(" + p.rz.toFixed(2) + "deg)";
  }
  function moveItem(it, pose, bump) {
    it.from = it.cur;
    it.to = pose;
    it.bump = bump || 0;
    it.sp.jump(0);
    return it.sp.to(1);
  }

  // Face the camera: the rig is pitched -18deg when a drawer is open.
  var FACE = 18;

  // Half the usable screen width, in the cabinet's own units at the cards' depth.
  function halfRoom() { return (sw / 2 - 14) / (G.fit * G.mag); }
  function fanSpacing() {
    var cw = G.dw - 16;
    return clamp(halfRoom() - cw / 2, cw * 0.5, cw + 60);
  }

  function groupsPose(it) {
    var gr = groups[it.g];
    var stack = [gr.divider].concat(gr.cards);
    var j = stack.indexOf(it);
    var n = stack.length;
    var step = G.compact ? 30 : 46;   // enough to show the call number and title above the card in front
    if (j < 0) return it.home;   // fillers stay in the drawer
    return {
      x: (it.g - 1) * fanSpacing(),
      y: -(G.dh - 6) - (n - 1 - j) * 0 - j * step,
      z: 40 + (n - j) * 14,   // back cards rise higher, so they step back further than the pitch brings them forward
      rx: FACE,
      rz: (it.g - 1) * 4 + (j - (n - 1) / 2) * 1.1
    };
  }

  function subjectPose(it) {
    if (it.g !== chosen || it.kind !== "card") return it.home;
    var gr = groups[chosen];
    var m = gr.cards.length, k = gr.cards.indexOf(it), c = (m - 1) / 2;
    var cw = G.dw - 16;
    var span = Math.max(0, Math.min(2 * (halfRoom() - cw / 2), (cw + 22) * (m - 1)));
    var stepX = m > 1 ? span / (m - 1) : 0;
    return {
      x: (k - c) * stepX,
      y: -(G.dh + 10) + Math.abs(k - c) * 10,
      z: 70 + k * 2,
      rx: FACE,
      rz: (k - c) * 3
    };
  }

  // Card choreography. moves: [{ it, pose, bump, delay }]. A new choreography supersedes any
  // starts still pending from the previous one (re-target, never stack). Resolves when every
  // moved card is near its pose, so the next motion can begin without waiting on the long tail.
  var chorSeq = 0;
  function choreograph(moves) {
    var my = ++chorSeq;
    return Promise.all(moves.map(function (mv) {
      return wait(mv.delay || 0).then(function () {
        if (my !== chorSeq) return;
        moveItem(mv.it, mv.pose, mv.bump || 0);
        return mv.it.sp.near(0.03);
      });
    })).then(function () { return my === chorSeq; });
  }
  function staggerMoves(list, poseFn, gap, bump) {
    return list.map(function (it, i) { return { it: it, pose: poseFn(it), bump: bump, delay: i * gap }; });
  }

  // focusable: in the Tab order. clickable: reachable by pointer (a superset).
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

  function updateCardStates() {
    items.forEach(function (it) {
      if (it.kind !== "card") return;
      var pr = progress[it.m.id];
      var node = $("[data-state]", it.el);
      node.textContent = pr ? (pr.again ? "Reviewed · " + pr.again + " to repeat" : "Reviewed") : "";
    });
  }

  /* =====================================================================
     Drawer flow
     ===================================================================== */

  function popOrder() {
    // Front to back inside each group, groups left to right: reads as one sweep.
    var out = [];
    groups.forEach(function (gr) { out.push(gr.divider); out = out.concat(gr.cards); });
    return out;
  }

  // Open and close are sequences on one token: starting either supersedes the other, and the
  // springs are re-targeted from where they are (keeping velocity), never restarted or stacked.
  var seq = 0;

  function lockOthers(v, locked) {
    drawerViews.forEach(function (o) { if (o !== v) o.btn.tabIndex = locked ? -1 : 0; });
    el.toShelf.inert = locked;
    el.toShelf.style.opacity = locked ? "0" : "";
  }

  function openDrawer(v) {
    if (drawer.view && drawer.view !== v) return;                    // another drawer is in use
    if (drawer.state !== "closed" && drawer.state !== "closing") return;
    var my = ++seq;
    var reopening = drawer.state === "closing";
    drawer.state = "opening";
    drawer.view = v;
    if (!reopening) chosen = -1;
    v.btn.setAttribute("aria-expanded", "true");
    v.hoverS.to(0);
    lockOthers(v, true);
    v.openS.to(1);
    return v.openS.near(0.03).then(function () {
      if (my !== seq) return;
      return wait(250);
    }).then(function () {
      if (my !== seq) return;
      return choreograph(staggerMoves(popOrder(), groupsPose, 35, -26));
    }).then(function () {
      if (my !== seq) return;
      drawer.state = "groups";
      renderBar();
      el.bar.hidden = false;
      setHint("Choose a subject");
      setItemsReachable(dividers(), groupItems());
      var first = $(".subj", el.subjects);
      if (first) first.focus({ preventScroll: true });
      announce("Flashcards drawer open. " + data.total + " cards in " + groups.length + " subjects. Choose a subject.");
    });
  }

  function chooseSubject(g) {
    if (drawer.state !== "groups" && drawer.state !== "subject") return;
    chosen = g;
    drawer.state = "subject";
    renderBar();
    var gr = groups[g];
    setHint("Choose a mistake to review");
    // Others sink back into the drawer; the chosen subject's cards spread out.
    var sinking = items.filter(function (it) { return it.g !== g && it.kind !== "filler"; }).concat([gr.divider]);
    var moves = staggerMoves(sinking.reverse(), function (it) { return it.home; }, 18, 0)
      .concat(staggerMoves(gr.cards, subjectPose, 35, -14));
    choreograph(moves).then(function (current) {
      if (!current || chosen !== g || drawer.state !== "subject") return;
      setItemsReachable(gr.cards);
      gr.cards[0].el.focus({ preventScroll: true });
    });
    setItemsReachable(gr.cards);
    announce(gr.s.name + ": " + gr.cards.length + " mistakes. Choose one to review.");
  }

  function backToGroups() {
    drawer.state = "groups";
    chosen = -1;
    renderBar();
    setHint("Choose a subject");
    choreograph(staggerMoves(popOrder(), groupsPose, 20, 0));
    setItemsReachable(dividers(), groupItems());
    var first = $(".subj", el.subjects);
    if (first) first.focus({ preventScroll: true });
  }

  // Close: cards drop back in (reverse stagger), then the drawer springs home against its stop,
  // and only then do the state flags change. Nothing is hidden or re-rendered during the motion.
  function closeDrawer() {
    var v = drawer.view;
    if (!v || drawer.state === "closing" || drawer.state === "review" || drawer.state === "closed") return;
    var my = ++seq;
    drawer.state = "closing";
    el.bar.hidden = true;
    setHint("");
    setItemsReachable([]);
    return choreograph(staggerMoves(popOrder().reverse(), function (it) { return it.home; }, 22, 0)).then(function () {
      if (my !== seq) return;
      return v.openS.to(0);
    }).then(function () {
      if (my !== seq) return;
      drawer.state = "closed";
      drawer.view = null;
      chosen = -1;
      v.btn.setAttribute("aria-expanded", "false");
      lockOthers(v, false);
      v.btn.focus({ preventScroll: true });
      announce("Flashcards drawer closed.");
    });
  }

  function setHint(text) {
    el.hint.hidden = !text;
    el.hint.innerHTML = text ? "<span>" + esc(text) + "</span>" : "";
  }

  function buildSubjectButtons() {
    el.subjects.innerHTML = data.subjects.map(function (s, g) {
      return '<button class="subj" type="button" data-g="' + g + '" style="--sub:' + s.accent + '" aria-pressed="false">' + esc(s.name) + "</button>";
    }).join("");
    $$(".subj", el.subjects).forEach(function (b) {
      b.addEventListener("click", function () {
        var g = +b.dataset.g;
        if (drawer.state === "subject" && chosen === g) { backToGroups(); return; }
        chooseSubject(g);
      });
    });
  }
  function renderBar() {
    $$(".subj", el.subjects).forEach(function (b) {
      b.setAttribute("aria-pressed", String(+b.dataset.g === chosen));
    });
  }
  el.close.addEventListener("click", function () {
    if (drawer.state === "review") { exitReview().then(closeDrawer); return; }
    closeDrawer();
  });

  /* =====================================================================
     Review: the chosen card leaves the fan and lies flat to be read
     ===================================================================== */

  var rv = null;   // { it, m, s, i, flipped, again, done }
  var flip = SB.createSpring(P.flip, function (x) {
    el.rcard.style.transform = "rotateY(" + (x * 180).toFixed(2) + "deg)";
  }, 0);
  var flyK = 0, flyFrom = null;
  var fly = SB.createSpring(P.drawer, function (k) {
    flyK = k;
    if (!flyFrom) return;
    el.fly.style.transform = "translate(" + (flyFrom.dx * k).toFixed(2) + "px," + (flyFrom.dy * k).toFixed(2) + "px) scale(" + (1 + (flyFrom.sc - 1) * k).toFixed(4) + ")";
    el.rscrim.style.opacity = (0.3 * clamp(1 - k, 0, 1)).toFixed(3);
  }, 1);

  function measureFly(it) {
    el.fly.style.transform = "none";
    var a = it.el.getBoundingClientRect();
    var b = el.fly.getBoundingClientRect();
    return {
      dx: (a.left + a.width / 2) - (b.left + b.width / 2),
      dy: (a.top + a.height / 2) - (b.top + b.height / 2),
      sc: Math.max(0.2, a.width / b.width)
    };
  }

  function faceFront(c) {
    return '<div class="rcard__meta"><span><b>' + esc(rv.m.call) + "</b> · " + esc(rv.s.name) + "</span><span>Card " + (c + 1) + " of " + rv.m.cards.length + "</span></div>" +
      '<p class="rcard__label">' + esc(rv.m.title) + "</p>" +
      '<h2 class="rcard__text rcard__h" tabindex="-1">' + esc(rv.m.cards[c].front) + "</h2>";
  }
  function faceBack(c) {
    return '<div class="rcard__meta"><span><b>' + esc(rv.m.call) + "</b> · Answer</span><span>Card " + (c + 1) + " of " + rv.m.cards.length + "</span></div>" +
      '<p class="rcard__label">What to do instead</p>' +
      '<p class="rcard__answer rcard__h" tabindex="-1">' + esc(rv.m.cards[c].back) + "</p>";
  }
  function faceDone() {
    var n = rv.m.cards.length;
    var line = rv.again ? n + " reviewed. " + rv.again + " marked to review again." : n + (n === 1 ? " card" : " cards") + " reviewed. All marked as got it.";
    return '<div class="rcard__meta"><span><b>' + esc(rv.m.call) + "</b> · " + esc(rv.s.name) + "</span><span>Done</span></div>" +
      '<p class="rcard__label">' + esc(rv.m.title) + "</p>" +
      '<h2 class="rcard__text rcard__h" tabindex="-1">' + esc(line) + "</h2>";
  }

  function setActions(list) {
    el.ractions.innerHTML = list.map(function (a, i) {
      return '<button class="rbtn' + (a.primary ? " rbtn--primary" : "") + '" type="button" data-a="' + i + '">' + esc(a.label) + "</button>";
    }).join("");
    $$(".rbtn", el.ractions).forEach(function (b) {
      b.addEventListener("click", function () { list[+b.dataset.a].run(); });
    });
  }

  function showFaces(front) {
    el.rfront.inert = !front; el.rfront.setAttribute("aria-hidden", String(!front));
    el.rback.inert = front; el.rback.setAttribute("aria-hidden", String(front));
  }

  function frontActions() {
    setActions([{ label: "Show Answer", primary: true, run: showAnswer }]);
  }
  function backActions() {
    setActions([
      { label: "Review Again", run: function () { grade(false); } },
      { label: "Got It", primary: true, run: function () { grade(true); } }
    ]);
  }

  function startReview(it) {
    if (drawer.state !== "subject") return;
    drawer.state = "review";
    rv = { it: it, m: it.m, s: it.s, i: 0, again: 0 };
    el.review.style.setProperty("--sub", it.s.accent);
    el.rfront.innerHTML = faceFront(0);
    el.rback.innerHTML = faceBack(0);
    showFaces(true);
    flip.jump(0);
    el.review.hidden = false;
    flyFrom = measureFly(it);
    fly.jump(1);
    it.el.style.visibility = "hidden";
    el.rprogress.textContent = it.s.name + " · " + it.m.title;
    frontActions();
    setItemsReachable([]);
    el.bar.hidden = true;
    setHint("");
    fly.to(0).then(function () {
      var h = $(".rcard__h", el.rfront);
      if (h) h.focus({ preventScroll: true });
    });
    announce("Reviewing " + it.m.title + ". Card 1 of " + it.m.cards.length + ".");
  }

  function showAnswer() {
    showFaces(false);
    flip.to(1);
    backActions();
    var h = $(".rcard__h", el.rback);
    if (h) h.focus({ preventScroll: true });
  }

  function grade(gotIt) {
    if (!gotIt) rv.again++;
    var next = rv.i + 1;
    if (next < rv.m.cards.length) {
      rv.i = next;
      el.rfront.innerHTML = faceFront(next);     // hidden while the card shows its back
      showFaces(true);
      flip.to(0).then(function () { el.rback.innerHTML = faceBack(next); });
      frontActions();
      var h = $(".rcard__h", el.rfront);
      if (h) h.focus({ preventScroll: true });
      announce("Card " + (next + 1) + " of " + rv.m.cards.length + ".");
    } else {
      progress[rv.m.id] = { done: true, again: rv.again };
      updateCardStates();
      el.rfront.innerHTML = faceDone();
      showFaces(true);
      flip.to(0);
      setActions([{ label: "Back to Mistakes", primary: true, run: function () { exitReview(); } }]);
      var d = $(".rcard__h", el.rfront);
      if (d) d.focus({ preventScroll: true });
      announce("Done. " + rv.m.cards.length + " reviewed.");
    }
  }

  function exitReview() {
    if (!rv) return Promise.resolve();
    var it = rv.it;
    flyFrom = measureFly(it);
    fly.jump(0);
    setActions([]);
    return fly.to(1).then(function () {
      el.review.hidden = true;
      it.el.style.visibility = "";
      el.bar.hidden = false;
      drawer.state = "subject";
      setHint("Choose a mistake to review");
      setItemsReachable(groups[chosen].cards);
      it.el.focus({ preventScroll: true });
      rv = null;
    });
  }

  /* =====================================================================
     Keys, resize, boot
     ===================================================================== */

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (SB.bookOpen && SB.bookOpen()) return;
    if (drawer.state === "review") { e.preventDefault(); exitReview(); }
    else if (drawer.state === "subject") { e.preventDefault(); backToGroups(); }
    else if (drawer.state === "groups" || drawer.state === "opening") { e.preventDefault(); closeDrawer(); }
  });

  var resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var before = sw;
      sw = el.world.clientWidth;
      el.stage.style.setProperty("--sw", sw + "px");
      if (!data || drawer.state !== "closed") return;
      var wasCompact = G.compact;
      computeGeometry();
      if (G.compact !== wasCompact || Math.abs(before - sw) > 0) buildCabinet();
    }, 120);
  });

  computeGeometry();
  fetch("data/flashcards.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { data = d; buildCabinet(); })
    .catch(function () {
      el.front.innerHTML = "";
      el.hint.hidden = false;
      el.hint.innerHTML = "<span>Couldn’t load data/flashcards.json. Serve this folder over http.</span>";
    });
})();
