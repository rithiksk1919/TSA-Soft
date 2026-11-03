/* SkillBridge Library: 3D shelf and the open-book dashboard.
   Everything renders from data/subjects.json. No libraries, no network beyond this folder. */
(function () {
  "use strict";

  var OPEN_MS = 1900;
  var CLOSE_MS = 1400;
  var EASE = "cubic-bezier(.2,.7,.2,1)";
  var PITCH = -6;              // resting scene tilt, so the shelf's top surfaces show
  var CLOSED_THICKNESS = 22;   // on-screen thickness of the book at the hand-off, px
  var PERSPECTIVE = 1200;      // matches .scene and .stage in library.css
  var LAND_Z = 40;             // depth of the cover plane at the hand-off

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var el = {
    library: $("#library"), top: $("#top"), intro: $("#intro"), foot: $("#foot"),
    scene: $("#scene"), rig: $("#rig"), row: $("#shelf-row"), error: $("#shelf-error"),
    reader: $("#reader"), bg: $(".reader__bg"), back: $("#back"), stage: $("#stage"),
    cam: $("#cam"), tilt: $("#tilt"), spread: $("#spread"), leaf: $("#leaf"),
    leafCover: $("#leaf-cover"), left: $("#page-left"), right: $("#page-right"),
    shadeL: $("#shade-left"), shadeR: $("#shade-right"),
    announcer: $("#announcer"), learner: $("#learner")
  };

  var mqReduce = matchMedia("(prefers-reduced-motion: reduce)");
  var mqNarrow = matchMedia("(max-width: 819px)");
  var mqFine = matchMedia("(hover: hover) and (pointer: fine)");

  var subjects = [];
  var current = null;   // the subject whose book is open
  var opener = null;    // the spine button that opened it
  var busy = false;
  var running = [];
  var uid = 0;

  var num = new Intl.NumberFormat("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- Helpers ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Pure logic lives in logic.js so it can be unit tested.
  function average(s) { return SBLogic.averageMastery(s.skills); }
  function level(k) { return SBLogic.levelLabel(k); }
  function depthOf(s) { return Math.round(s.book.height * 0.66); }

  /* ---------- Logos (inline SVG, currentColor) ---------- */

  function logo(kind, extra) {
    var cls = "logo" + (extra ? " " + extra : "");
    var open = '<svg class="' + cls + '" viewBox="-24 -24 48 48" fill="none" aria-hidden="true" focusable="false">';
    if (kind === "flask") {
      var id = "flask-clip-" + (++uid);
      var body = "M-3-19.5V-6L-13.2 14.2Q-14.3 16.4-11.8 16.4H11.8Q14.3 16.4 13.2 14.2L3-6V-19.5";
      return open +
        '<defs><clipPath id="' + id + '"><path d="' + body + 'Z"/></clipPath></defs>' +
        '<g clip-path="url(#' + id + ')">' +
          '<path class="a wave" d="M-44 3Q-39 .6-34 3T-24 3T-14 3T-4 3T6 3T16 3T26 3T36 3V20H-44Z" fill="currentColor" opacity=".38"/>' +
          '<circle class="a bubble" cx="-4" cy="12" r="1.6" fill="currentColor" style="animation-delay:0s"/>' +
          '<circle class="a bubble" cx="2.5" cy="13" r="1.2" fill="currentColor" style="animation-delay:-.87s"/>' +
          '<circle class="a bubble" cx="6" cy="11" r="1.8" fill="currentColor" style="animation-delay:-1.73s"/>' +
        "</g>" +
        '<path d="' + body + '" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<path d="M-6-19.5H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
        "</svg>";
    }
    if (kind === "dna") {
      var rungs = "";
      for (var i = 0; i < 6; i++) {
        var y = -15 + i * 6;
        rungs += '<g class="a rung" style="animation-delay:-' + (i * 0.42).toFixed(2) + 's">' +
          '<line x1="-10" y1="' + y + '" x2="10" y2="' + y + '" stroke="currentColor" stroke-width="1.4"/>' +
          '<circle cx="-10" cy="' + y + '" r="2.1" fill="currentColor"/>' +
          '<circle cx="10" cy="' + y + '" r="2.1" fill="currentColor" opacity=".55"/></g>';
      }
      return open + rungs + "</svg>";
    }
    // atom (default)
    return open +
      '<g stroke="currentColor" stroke-width="1.3">' +
        '<ellipse rx="18" ry="7"/><ellipse rx="18" ry="7" transform="rotate(60)"/><ellipse rx="18" ry="7" transform="rotate(120)"/>' +
      "</g>" +
      '<circle r="3" fill="currentColor"/>' +
      '<g><circle class="a e" r="2" fill="currentColor" style="animation-delay:0s"/></g>' +
      '<g transform="rotate(60)"><circle class="a e" r="2" fill="currentColor" style="animation-delay:-1.333s"/></g>' +
      '<g transform="rotate(120)"><circle class="a e" r="2" fill="currentColor" style="animation-delay:-2.667s"/></g>' +
      "</svg>";
  }

  function coverInner(s) {
    return '<span class="cover__frame"></span>' +
      '<span class="cover__logo">' + logo(s.logo) + "</span>" +
      '<span class="cover__title">' + esc(s.name) + "</span>" +
      '<span class="cover__rule"></span>' +
      '<span class="cover__meta" translate="no">SkillBridge</span>';
  }

  /* ---------- Shelf ---------- */

  function bookMarkup(s) {
    var w = s.book.width, h = s.book.height, d = depthOf(s);
    return '<li class="slot" data-id="' + esc(s.id) + '" style="--w:' + w + "px;--h:" + h + "px;--d:" + d + "px;--accent:" + esc(s.accent) + '">' +
      '<span class="contact" aria-hidden="true"></span>' +
      '<div class="mover"><div class="carry">' +
        '<button class="book" type="button" data-id="' + esc(s.id) + '" aria-label="Open the ' + esc(s.name) + ' book" aria-expanded="false" aria-controls="reader">' +
          '<span class="face face--back"></span>' +
          '<span class="face face--fore"></span>' +
          '<span class="face face--top"></span>' +
          '<span class="face face--bottom"></span>' +
          '<span class="face face--front"><span class="cover">' + coverInner(s) + "</span></span>" +
          '<span class="face face--spine"><span class="spine">' +
            logo(s.logo) +
            '<span class="spine__rule"></span>' +
            '<span class="spine__title">' + esc(s.name) + "</span>" +
            '<span class="spine__rule"></span>' +
            '<span class="spine__score">' + num.format(average(s)) + "</span>" +
          "</span></span>" +
        "</button>" +
      "</div></div></li>";
  }

  function renderShelf() {
    el.row.innerHTML = subjects.map(bookMarkup).join("") +
      '<li class="slot slot--empty"><span>More subjects</span></li>';
  }

  /* ---------- Open book pages ---------- */

  function renderReader(s) {
    el.reader.style.setProperty("--accent", s.accent);
    var avg = average(s);

    var rows = s.skills.map(function (k) {
      var noteCls = "skill__note" + (k.note === "Next up" ? " skill__note--next" : "");
      return '<li class="skill">' +
        '<div class="skill__line"><span class="skill__name">' + esc(k.name) + '</span><span class="skill__value">' + num.format(k.mastery) + "</span></div>" +
        '<span class="bar" aria-hidden="true"><span class="bar__fill" style="width:' + (k.mastery * 100).toFixed(1) + '%"></span></span>' +
        '<div class="skill__meta"><span>' + esc(level(k)) + "</span>" + (k.note ? '<span class="' + noteCls + '">' + esc(k.note) + "</span>" : "") + "</div>" +
        "</li>";
    }).join("");

    el.left.innerHTML =
      '<div class="stand-head"><div>' +
        '<p class="eyebrow">' + esc(s.name) + "</p>" +
        '<h2 class="page-title" id="where-title" tabindex="-1">Where you stand</h2>' +
        '<p class="summary">Average mastery <b>' + num.format(avg) + "</b> across " + s.skills.length + " skills</p>" +
      "</div>" +
      '<span class="live-logo">' + logo(s.logo, "logo--live") + "</span></div>" +
      '<ul class="skills">' + rows + "</ul>";

    var n = s.next;
    var log = n.log.map(function (p) { return "<dt>" + esc(p[0]) + "</dt><dd>" + esc(p[1]) + "</dd>"; }).join("");
    el.right.innerHTML =
      "<div>" +
        '<p class="kicker">Next practice</p>' +
        '<h2 class="scenario" id="next-title">' + esc(n.title) + "</h2>" +
        '<ul class="chips"><li class="chip chip--skill">' + esc(n.skill) + '</li><li class="chip">' + esc(n.type) + "</li></ul>" +
        '<p class="difficulty">Difficulty <b>' + num.format(n.difficulty) + "</b>, a slight stretch above your current <b>" + num.format(n.mastery) + "</b></p>" +
        '<a class="start" href="/practice?scenario=' + encodeURIComponent(n.id) + '">Start practice' +
          '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></a>' +
      "</div>" +
      '<div class="why"><h3 class="subhead">Why this next?</h3><p>' + esc(n.why) + '</p><dl class="log" aria-label="Decision log">' + log + "</dl></div>" +
      '<div class="mistakes"><h3 class="subhead">Recent mistakes</h3><ul>' +
        n.mistakes.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") +
      "</ul></div>";

    el.leafCover.innerHTML = coverInner(s);
  }

  /* ---------- Pointer parallax ---------- */

  var par = { rx: PITCH, ry: 0, tx: PITCH, ty: 0, raf: 0 };

  function atShelf() {
    var sb = window.SkillBridge;
    return !(sb && sb.atShelf) || sb.atShelf();
  }
  function parallaxAllowed() {
    return mqFine.matches && !mqReduce.matches && !current && !busy && atShelf();
  }
  function parallaxTick() {
    par.rx += (par.tx - par.rx) * 0.08;
    par.ry += (par.ty - par.ry) * 0.08;
    el.rig.style.transform = "rotateX(" + par.rx.toFixed(3) + "deg) rotateY(" + par.ry.toFixed(3) + "deg)";
    if (Math.abs(par.tx - par.rx) > 0.005 || Math.abs(par.ty - par.ry) > 0.005) {
      par.raf = requestAnimationFrame(parallaxTick);
    } else {
      par.raf = 0;
    }
  }
  function aimParallax(x, y) {
    par.ty = (x / window.innerWidth - 0.5) * 8;          // +/- 4deg
    par.tx = PITCH + (y / window.innerHeight - 0.5) * -4; // +/- 2deg around the pitch
    if (!par.raf) par.raf = requestAnimationFrame(parallaxTick);
  }
  function stopParallax() {
    if (par.raf) cancelAnimationFrame(par.raf);
    par.raf = 0;
  }
  function resetParallax() {
    stopParallax();
    par.rx = par.tx = PITCH;
    par.ry = par.ty = 0;
    el.rig.style.transform = "";
  }

  window.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || !parallaxAllowed()) return;
    aimParallax(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener("pointerleave", function () {
    if (!parallaxAllowed()) return;
    aimParallax(window.innerWidth / 2, window.innerHeight / 2);
  });
  mqReduce.addEventListener("change", resetParallax);

  /* ---------- The open timeline (one 1900ms timeline, every segment placed on it) ---------- */

  function seg(target, keyframes, start, end, opts) {
    var o = { delay: start, duration: Math.max(1, end - start), endDelay: OPEN_MS - end, fill: "both", easing: "linear" };
    if (opts) for (var k in opts) o[k] = opts[k];
    return target.animate(keyframes, o);
  }

  var WILL = [];
  function willChange(list) {
    WILL = list;
    // transform only: will-change: opacity creates a flat group, the same as opacity < 1.
    list.forEach(function (n) { n.style.willChange = "transform"; });
  }
  function clearWillChange() {
    WILL.forEach(function (n) { n.style.willChange = ""; });
    WILL = [];
  }

  function build3D(slot, lifted) {
    var book = $(".book", slot), mover = $(".mover", slot), carry = $(".carry", slot);

    // FLIP "first": the spine's flat position, measured with the scene pitch removed.
    var rigInline = el.rig.style.transform;
    el.rig.style.transform = "none";
    var b = slot.getBoundingClientRect();
    el.rig.style.transform = rigInline;
    var sceneBox = el.scene.getBoundingClientRect();

    // FLIP "last": the flat spread, in its final layout.
    var sp = el.spread.getBoundingClientRect();
    var st = el.stage.getBoundingClientRect();
    var vw = el.reader.clientWidth, vh = window.innerHeight;
    var W = sp.width, H = sp.height;

    // Camera scale while the book is closed and opening, so the open spread fits on screen.
    var s = Math.min(0.62 * vh / H, 0.84 * vw / W, 1);
    var cx0 = vw / 2 - (sp.left + W / 2);
    var cy0 = vh / 2 - (sp.top + H / 2);

    // Where the shelf book must land: exactly over the closed book's cover (the right page).
    // The cover lands at z = LAND_Z, in front of the board's front edge, so the board never cuts
    // across it. Size and position are divided by the perspective factor at that depth, measured
    // from the scene's own eye point, so the projected cover matches the closed book to the pixel.
    var w = b.width, h = b.height;
    var d = parseFloat(getComputedStyle(slot).getPropertyValue("--d"));
    var ox = sceneBox.left + sceneBox.width * 0.5, oy = sceneBox.top + sceneBox.height * 0.35;
    var f = PERSPECTIVE / (PERSPECTIVE - LAND_Z);
    var cxs = ox + (vw / 2 - ox) / f, cys = oy + (vh / 2 - oy) / f;
    var sx = (s * W / 2) / f / d;
    var sy = (s * H) / f / h;
    var sz = CLOSED_THICKNESS / f / w;
    var dx = cxs - (b.left + w / 2);
    var dy = cys - (b.top + h / 2);
    var tz = LAND_Z + d / 2 - (sz * w) / 2;

    // The reader shares the shelf's eye point, so the hand-off matches.
    el.stage.style.perspectiveOrigin = (ox - st.left).toFixed(1) + "px " + (oy - st.top).toFixed(1) + "px";
    el.spread.style.setProperty("--t", (CLOSED_THICKNESS / s).toFixed(2) + "px");

    var A = [];
    var others = $$(".slot", el.row).filter(function (n) { return n !== slot; });

    // 0-300: the room quiets
    [el.top, el.intro, el.foot, $("#to-cabinet")].forEach(function (n) {
      A.push(seg(n, [{ opacity: 1 }, { opacity: 0 }], 0, 300, { easing: "ease-out" }));
    });
    others.forEach(function (o) {
      if (o.classList.contains("slot--empty")) {
        A.push(seg(o, [{ opacity: 1, transform: "translateY(0px)" }, { opacity: 0.55, transform: "translateY(6px)" }], 0, 300, { easing: EASE }));
        return;
      }
      $$(".face, .contact", o).forEach(function (f) {
        A.push(seg(f, [{ opacity: 1 }, { opacity: 0.55 }], 0, 300, { easing: EASE }));
      });
      A.push(seg($(".mover", o), [{ transform: "translateY(0px)" }, { transform: "translateY(6px)" }], 0, 300, { easing: EASE }));
    });
    A.push(seg($(".contact", slot), [{ opacity: 1 }, { opacity: 0 }], 0, 300, { easing: EASE }));

    // 0-420: the hover pose settles, then 700-900 the thickness compresses while edge-on
    var pose = lifted ? "translate3d(0px,-10px,24px) rotateY(-6deg) scale3d(1,1,1)" : "translate3d(0px,0px,0px) rotateY(0deg) scale3d(1,1,1)";
    var rest = "translate3d(0px,0px,0px) rotateY(0deg) scale3d(1,1,1)";
    A.push(seg(book, [
      { offset: 0, transform: pose, easing: EASE },
      { offset: 420 / 900, transform: rest },
      { offset: 700 / 900, transform: rest, easing: "ease-in" },
      { offset: 1, transform: "translate3d(0px,0px,0px) rotateY(0deg) scale3d(" + sz.toFixed(4) + ",1,1)" }
    ], 0, 900));

    // 0-450: pull out of the row toward the viewer, then hand the depth back
    A.push(seg(mover, [
      { offset: 0, transform: "translate3d(0px,0px,0px)", easing: EASE },
      { offset: 0.5, transform: "translate3d(0px,-18px,140px)", easing: "cubic-bezier(.4,0,.2,1)" },
      { offset: 1, transform: "translate3d(0px,0px,0px)" }
    ], 0, 900));

    // 350-900: turn the front cover to the viewer, scale up, travel to the centre
    A.push(seg(carry, [
      { transform: "translate3d(0px,0px,0px) scale3d(1,1,1) rotateY(0deg)" },
      { transform: "translate3d(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px," + tz.toFixed(2) + "px) scale3d(" + sx.toFixed(4) + "," + sy.toFixed(4) + ",1) rotateY(-90deg)" }
    ], 350, 900, { easing: EASE }));

    // 350-900: scene pitch and parallax ease to zero
    A.push(seg(el.rig, [
      { transform: "rotateX(" + par.rx.toFixed(3) + "deg) rotateY(" + par.ry.toFixed(3) + "deg)" },
      { transform: "rotateX(0deg) rotateY(0deg)" }
    ], 350, 900, { easing: EASE }));

    // 900: hand-off, in one frame, from the shelf cuboid to the real pages
    A.push(seg(carry, [{ visibility: "visible" }, { visibility: "hidden" }], 0, 900, { easing: "step-end" }));
    A.push(seg(el.reader, [{ visibility: "hidden" }, { visibility: "visible" }], 0, 900, { easing: "step-end" }));

    // 900-1500: the cover swings open on the spine; 1500-1900 it settles flat
    A.push(seg(el.leaf, [
      { offset: 0, transform: "translateZ(2px) rotateY(180deg)", easing: EASE },
      { offset: 0.6, transform: "translateZ(1px) rotateY(8deg)", easing: "ease-out" },
      { offset: 1, transform: "translateZ(0px) rotateY(0deg)" }
    ], 900, 1900));

    // 950-1500: the camera recentres from the closed book to the spread
    A.push(seg(el.spread, [
      { transform: "translate3d(" + (-W / 4).toFixed(2) + "px,0px,0px)" },
      { transform: "translate3d(0px,0px,0px)" }
    ], 950, 1500, { easing: EASE }));

    // 900-1750: a slight tilt shows the page block, then levels
    A.push(seg(el.tilt, [
      { offset: 0, transform: "rotateX(0deg) rotateY(0deg)", easing: "ease-out" },
      { offset: 0.45, transform: "rotateX(9deg) rotateY(-5deg)", easing: "ease-in-out" },
      { offset: 1, transform: "rotateX(0deg) rotateY(0deg)" }
    ], 900, 1750));

    // 1400-1900: dolly in until the spread fills the content width; ends at identity
    A.push(seg(el.cam, [
      { transform: "translate3d(" + cx0.toFixed(2) + "px," + cy0.toFixed(2) + "px,0px) scale3d(" + s.toFixed(4) + "," + s.toFixed(4) + "," + s.toFixed(4) + ")" },
      { transform: "translate3d(0px,0px,0px) scale3d(1,1,1)" }
    ], 1400, 1900, { easing: EASE }));

    // Cast shadows that move with the cover
    A.push(seg(el.shadeR, [{ opacity: 0 }, { offset: 0.45, opacity: 0.14 }, { opacity: 0 }], 900, 1500, { easing: "ease-in-out" }));
    A.push(seg(el.shadeL, [{ opacity: 0.18 }, { offset: 0.5, opacity: 0.14 }, { opacity: 0 }], 900, 1560, { easing: "ease-out" }));

    // Page-block thickness: visible while the book is a solid, gone by the flat end
    $$(".edge", $("#edges")).forEach(function (n) {
      A.push(seg(n, [{ opacity: 1 }, { opacity: 0 }], 1450, 1800, { easing: "ease-in" }));
    });
    $$(".edge", $("#edges-left")).forEach(function (n) {
      A.push(seg(n, [{ opacity: 0 }, { offset: 0.3, opacity: 1 }, { offset: 0.46, opacity: 1 }, { opacity: 0 }], 1150, 1800));
    });

    // The room behind turns to page, the way back appears
    A.push(seg(el.bg, [{ opacity: 0 }, { opacity: 1 }], 1400, 1900, { easing: EASE }));
    A.push(seg(el.back, [{ opacity: 0 }, { opacity: 1 }], 1560, 1900, { easing: "ease-out" }));

    willChange([book, mover, carry, el.rig, el.cam, el.tilt, el.spread, el.leaf]);
    return A;
  }

  function settle(list) {
    return Promise.all(list.map(function (a) { return a.finished; })).catch(function () {});
  }
  function cancelAll() {
    running.forEach(function (a) { a.cancel(); });
    running = [];
  }
  function mode() {
    if (mqReduce.matches) return "reduce";
    if (mqNarrow.matches) return "narrow";
    return "3d";
  }
  function announce(msg) {
    el.announcer.textContent = "";
    setTimeout(function () { el.announcer.textContent = msg; }, 30);
  }

  /* ---------- Open / close ---------- */

  function open(id, btn) {
    if (busy || current || !atShelf()) return;
    var s = subjects.find(function (x) { return x.id === id; });
    if (!s) return;
    var slot = btn.closest(".slot");
    var lifted = btn.matches(":hover") || btn.matches(":focus-visible");

    busy = true; current = s; opener = btn;
    stopParallax();
    renderReader(s);
    el.reader.classList.add("is-active");
    el.library.style.pointerEvents = "none";
    btn.setAttribute("aria-expanded", "true");

    var m = mode();
    if (m === "3d") {
      slot.classList.add("is-flying");
      el.reader.classList.add("is-flying");
      running = build3D(slot, lifted);
    } else {
      el.reader.classList.add("is-open");
      running = [el.reader.animate([{ opacity: 0 }, { opacity: 1 }], { duration: m === "reduce" ? 150 : 320, easing: EASE, fill: "both" })];
    }

    settle(running).then(function () {
      el.reader.classList.add("is-open");
      el.library.classList.add("is-covered");
      el.library.inert = true;
      el.library.style.visibility = "hidden";
      cancelAll();
      clearWillChange();
      $("#where-title").focus({ preventScroll: true });
      announce(s.name + " book opened");
      busy = false;
    });
  }

  function close() {
    if (busy || !current) return;
    busy = true;
    var s = current, btn = opener, slot = btn.closest(".slot");
    if (el.reader.contains(document.activeElement)) document.activeElement.blur();

    el.library.style.visibility = "";
    el.library.inert = false;
    el.library.classList.remove("is-covered");

    var m = mode();
    if (m === "3d") {
      resetParallax();
      running = build3D(slot, false);
      var rate = -(OPEN_MS / CLOSE_MS);
      running.forEach(function (a) { a.pause(); a.currentTime = OPEN_MS; });
      el.reader.classList.remove("is-open");
      running.forEach(function (a) { a.playbackRate = rate; a.play(); });
    } else {
      running = [el.reader.animate([{ opacity: 1 }, { opacity: 0 }], { duration: m === "reduce" ? 150 : 260, easing: EASE, fill: "both" })];
    }

    settle(running).then(function () {
      cancelAll();
      clearWillChange();
      el.reader.classList.remove("is-open", "is-active", "is-flying");
      slot.classList.remove("is-flying");
      el.reader.scrollTop = 0;
      el.library.style.pointerEvents = "";
      btn.setAttribute("aria-expanded", "false");
      btn.focus({ preventScroll: true });
      announce(s.name + " book closed");
      current = null; opener = null; busy = false;
    });
  }

  window.SkillBridge = window.SkillBridge || {};
  window.SkillBridge.bookOpen = function () { return !!current || busy; };

  el.row.addEventListener("click", function (e) {
    var btn = e.target.closest(".book");
    if (btn) open(btn.dataset.id, btn);
  });
  el.back.addEventListener("click", close);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && current) { e.preventDefault(); close(); }
  });

  /* ---------- Boot ---------- */

  fetch("data/subjects.json")
    .then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    })
    .then(function (data) {
      subjects = data.subjects || [];
      if (data.learner) {
        el.learner.innerHTML = '<span class="learner__initials" aria-hidden="true">' + esc(data.learner.initials) +
          '</span><span><span class="learner__name">' + esc(data.learner.name) + "</span> · Saved on this device</span>";
      }
      renderShelf();
    })
    .catch(function () {
      el.error.hidden = false;
      el.error.textContent = "Couldn’t load data/subjects.json. Open this folder through a local web server (for example: python -m http.server) rather than as a file.";
    });
})();
