/* SkillBridge: the library room, the home screen. Three stations stand in one room; clicking one
   springs the camera in (a zoom toward that station) and lands in its close-up scene. "Library" in
   the header pulls back out. Deep links #shelf and #practice skip the room. */
(function () {
  "use strict";
  var SB = window.SkillBridge;
  var ui = SB.ui, P = SB.PRESETS, $ = ui.$, $$ = ui.$$;

  var room = $("#room"), link = $("#to-room"), note = $("#room-note");
  var release = null, from = null, noteTimer = 0;

  var zoom = SB.createSpring(P.camera, function (k) {
    room.style.transform = "scale(" + (1 + 1.6 * k).toFixed(4) + ")";
    room.style.opacity = ui.clamp(1 - k * 1.25, 0, 1).toFixed(3);
  }, 0);

  function busy() { return (SB.bookOpen && SB.bookOpen()) || (SB.debug && SB.debug.drawer() !== "closed"); }

  function show(focusEl) {
    room.hidden = false;
    link.hidden = true;
    release = ui.isolate([room]);
    if (focusEl) focusEl.focus({ preventScroll: true });
  }

  function enter(station) {
    var scene = station.dataset.scene;
    if (scene === "apply") {
      note.textContent = "The reading desk opens next: solve a real scenario, step by step.";
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { note.textContent = ""; }, 3200);
      ui.announce(note.textContent);
      return;
    }
    from = station;
    var r = station.getBoundingClientRect(), box = room.getBoundingClientRect();
    room.style.transformOrigin = (r.left + r.width / 2 - box.left) + "px " + (r.top + r.height / 2 - box.top) + "px";
    SB.jumpScene(scene === "practice" ? 1 : 0);
    if (release) { release(); release = null; }
    var done = SB.reducedMotion() ? ui.fade(room, 1, 0) : (zoom.jump(0), zoom.to(1));
    done.then(function () {
      room.hidden = true;
      link.hidden = false;
      history.replaceState(null, "", scene === "practice" ? "#practice" : "#shelf");
      $(scene === "practice" ? "#h-b" : "#h-a").focus({ preventScroll: true });
      ui.announce(scene === "practice" ? "Card catalog. Practice your mistakes." : "Bookshelf. Learn your mistakes.");
    });
  }

  function leave() {
    if (busy()) return;
    var target = from || $('.station[data-scene="' + (SB.debug.scene() === 1 ? "practice" : "learn") + '"]');
    show(target);
    history.replaceState(null, "", location.pathname);
    if (SB.reducedMotion()) { zoom.jump(0); room.style.opacity = ""; ui.fade(room, 0, 1); }
    else { zoom.jump(1); zoom.to(0); }
    ui.announce("The library.");
  }

  $$(".station", room).forEach(function (s) { s.addEventListener("click", function () { enter(s); }); });
  link.addEventListener("click", leave);
  document.addEventListener("keydown", function (e) {
    // Esc with nothing else open goes back out to the library (book, drawer and review close first).
    if (e.key === "Escape" && room.hidden && !busy() && !SB.review.isOpen() && !(SB.panel && SB.panel.isOpen())) leave();
  });

  // Boot: deep links skip the room.
  var hash = location.hash.slice(1);
  if (hash === "shelf" || hash === "practice") {
    room.hidden = true;
    link.hidden = false;
    if (hash === "practice") SB.store.ready.then(function () { SB.jumpScene(1); });
  } else {
    show();
  }
})();
