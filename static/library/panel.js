/* SkillBridge drawer panel: the shared shell for drawer contents.
   Desktop: a card tray floating over the dimmed room, above the pulled-out drawer.
   Under 820px: a bottom sheet with its own scrim sibling. Contents pop in staggered (card pop
   spring) and drop out in reverse. Focus is trapped inside while it is open. */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, $ = ui.$, $$ = ui.$$, esc = ui.esc;

  var sheet = document.getElementById("sheet");
  var scrim = document.getElementById("sheet-scrim");
  var el = { call: $(".sheet__call", sheet), title: $(".sheet__title", sheet), sub: $(".sheet__sub", sheet), body: $(".sheet__body", sheet), close: $(".sheet__close", sheet) };

  var cur = null;    // { id, opts, release, back }
  var popSeq = 0;
  var frameK = 0;

  // The sheet's height, measured once when a motion starts (not every frame: reading it per frame
  // forced a style and layout pass after the other springs' writes).
  var sheetH = 0;
  var frame = SB.createSpring(P.drawer, function (k) {
    frameK = k;
    var c = ui.clamp(k, 0, 1.2);
    if (ui.narrow()) {
      var h = sheetH || 600;
      sheet.style.transform = "translateY(" + ((1 - c) * (h + 24)).toFixed(1) + "px)";
      sheet.style.opacity = "";
      scrim.style.opacity = (0.38 * ui.clamp(k, 0, 1)).toFixed(3);
    } else {
      sheet.style.transform = "translateY(" + ((1 - c) * 36).toFixed(1) + "px) scale(" + (0.97 + 0.03 * c).toFixed(4) + ")";
      sheet.style.opacity = ui.clamp(k * 1.6, 0, 1).toFixed(3);
      scrim.style.opacity = "0";
    }
  }, 0);

  // While the sheet moves it gets its own compositor layer (and the phone scrim too), so each frame
  // moves a layer instead of repainting the sheet and its shadow. Cleared at rest: the resting
  // rendering is unchanged.
  function startMotion() {
    sheetH = sheet.offsetHeight;
    sheet.style.willChange = "transform, opacity";
    if (ui.narrow()) scrim.style.willChange = "opacity";
  }
  function endMotion() {
    if (frame.moving()) return;
    sheet.style.willChange = "";
    scrim.style.willChange = "";
  }

  // Per-item pop: each .pop element gets its own spring, staggered 35ms.
  function itemSpring(node) {
    if (!node._pop) {
      node._pop = SB.createSpring(P.pop, function (t) {
        node.style.transform = "translateY(" + ((1 - t) * 22).toFixed(2) + "px)";
        node.style.opacity = ui.clamp(t * 1.5, 0, 1).toFixed(3);
      }, 0);
    }
    return node._pop;
  }

  // Animates the .pop elements inside container; with self, the container itself too (when it is one).
  function pop(container, gap, self) {
    var my = ++popSeq;
    var nodes = $$(".pop", container || el.body);
    if (self && container && container.classList.contains("pop")) nodes.unshift(container);
    if (SB.reducedMotion()) { nodes.forEach(function (n) { itemSpring(n).jump(1); }); return Promise.resolve(); }
    nodes.forEach(function (n) { itemSpring(n).jump(0); });
    return Promise.all(nodes.map(function (n, i) {
      return ui.wait(i * (gap || 35)).then(function () {
        if (my !== popSeq) return;
        var s = itemSpring(n); s.to(1); return s.near(0.04);
      });
    }));
  }

  function drop() {
    var my = ++popSeq;
    var nodes = $$(".pop", el.body).filter(function (n) { return n.getBoundingClientRect().bottom > 0; }).reverse();
    if (SB.reducedMotion()) return Promise.resolve();
    return Promise.all(nodes.slice(0, 14).map(function (n, i) {
      return ui.wait(i * 22).then(function () {
        if (my !== popSeq) return;
        var s = itemSpring(n); s.to(0); return s.near(0.08);
      });
    }));
  }

  var api = {
    body: el.body,
    pop: pop,
    // A nested view sets back(); Esc and the browser-like back path call it before closing.
    setBack: function (fn) { if (cur) cur.back = fn || null; },
    setTitle: function (t, sub) { el.title.textContent = t; if (sub != null) el.sub.textContent = sub; },
    scrollTop: function () { el.body.scrollTop = 0; },
    focusTitle: function () { el.title.focus({ preventScroll: true }); }
  };

  // opts: { id, call, title, sub, accent, render(body, api), onCloseRequest() }
  function open(opts) {
    // Re-opened while it was closing: cancel the close and spring back in from where it is.
    if (cur && cur.closing && cur.id === opts.id) {
      cur.closing = false;
      sheet.style.pointerEvents = "";
      scrim.style.pointerEvents = "";
      cur.release = ui.isolate([sheet]);
      ++popSeq;
      $$(".pop", el.body).forEach(function (n) { itemSpring(n).to(1); });
      startMotion();
      frame.to(1).then(endMotion);
      api.focusTitle();
      return frame.near(0.12);
    }
    if (cur) return Promise.resolve();
    cur = { id: opts.id, opts: opts, back: null };
    sheet.dataset.drawer = opts.id;
    sheet.style.setProperty("--sub", opts.accent || "var(--ink)");
    el.call.textContent = opts.call || "";
    el.title.textContent = opts.title || "";
    el.sub.textContent = opts.sub || "";
    el.body.innerHTML = "";
    el.body._mount = null;      // ends the previous view's live store subscription (drawers.js live())
    el.body.onkeydown = null;   // and any key handler it left on the shared body
    el.body.scrollTop = 0;
    sheet.hidden = false;
    scrim.hidden = false;
    sheet.style.pointerEvents = "";
    scrim.style.pointerEvents = "";
    sheet.classList.add("is-open");
    opts.render(el.body, api);
    cur.release = ui.isolate([sheet]);
    var shown;
    if (SB.reducedMotion()) {
      frame.jump(1);
      $$(".pop", el.body).forEach(function (n) { itemSpring(n).jump(1); });
      shown = Promise.all([ui.fade(sheet, 0, 1), ui.narrow() ? ui.fade(scrim, 0, 1) : null]);
    } else {
      $$(".pop", el.body).forEach(function (n) { itemSpring(n).jump(0); });
      startMotion();
      frame.jump(0);
      frame.to(1).then(endMotion);
      shown = frame.near(0.12).then(function () { return pop(); });
    }
    api.focusTitle();
    return shown;
  }

  function close() {
    if (!cur) return Promise.resolve();
    var c = cur;
    if (c.closing) return c.closingPromise;
    c.closing = true;
    // The panel is leaving: release the focus trap now, so the room is usable during the motion
    // (a click on another drawer, or the same one to re-open, is not swallowed by inert).
    if (c.release) { c.release(); c.release = null; }
    // The departing tray floats over the drawers: let clicks through to the room while it goes.
    sheet.style.pointerEvents = "none";
    scrim.style.pointerEvents = "none";
    var done;
    if (SB.reducedMotion()) {
      done = Promise.all([ui.fade(sheet, 1, 0), ui.narrow() ? ui.fade(scrim, 1, 0) : null]);
    } else {
      done = drop().then(function () { startMotion(); return frame.to(0).then(endMotion); });
    }
    c.closingPromise = done.then(function () {
      if (cur !== c || !c.closing) return;   // re-opened meanwhile
      sheet.hidden = true;
      scrim.hidden = true;
      sheet.classList.remove("is-open");
      sheet.style.opacity = "";
      el.body.innerHTML = "";
      cur = null;
    });
    return c.closingPromise;
  }

  // Esc inside the panel: a nested view goes back first; otherwise ask the cabinet to close.
  function back() {
    if (!cur) return false;
    if (cur.back) { var fn = cur.back; cur.back = null; fn(); return true; }
    return false;
  }

  el.close.addEventListener("click", function () { if (cur && cur.opts.onCloseRequest) cur.opts.onCloseRequest(); });
  scrim.addEventListener("click", function () { if (cur && cur.opts.onCloseRequest) cur.opts.onCloseRequest(); });

  SB.panel = {
    open: open, close: close, back: back, pop: pop, api: api,
    isOpen: function () { return !!cur; },
    id: function () { return cur ? cur.id : null; }
  };
})();
