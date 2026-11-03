# Running notes (compiled into REPORT.md)

## Phase 1: drawer-close flicker
- Not reproducible by eye in headless Chromium: headless frames run at ~30-40 fps, where the
  semi-implicit Euler drawer spring barely undershoots. Measured anyway: min depth 0.76px (< the 1px
  the face sits in front of the cabinet front).
- Root cause: the drawer travel spring (170/20, zeta 0.77) undershoots past "closed" by up to ~2.3%
  of 260px. The face rests only 1px in front of the opaque cabinet front, so any undershoot > 1px puts
  the face behind the front: the slot looks empty (dark cavity) until the spring swings back.
  Simulated: 120 fps -> -3.85px, hidden 233 ms; 60 fps -> -1.87px, hidden 150 ms; 30 fps -> 0.
  Worse on high-refresh displays, which is why it was seen on a real machine and not in CI.
- Contributing: close waited for every card spring's long tail (~0.6 s idle with the drawer open and
  empty) before the drawer moved, which made the "gone, then back" read longer.
- Of the brief's suspects: a (hidden at start) no; b (state flipped early) no; c (two motions fighting)
  partly: hover and open both feed the same transform but additively, and stagger timers from a
  superseded choreography could still fire (now tokenised); d (flattening ancestor) no; e (scrim on a
  different frame) no, both come from the same render.
- Fix: closed is a hard stop. logic.stepSpring gains optional min/max stops with restitution;
  PRESETS.drawerTravel = drawer spring + min 0 (restitution 0.18) for open and hover travel.
  Open/close are sequences on one token (re-target, never stack); Esc during the opening closes;
  clicking during a close re-opens from the current position and velocity; the drawer starts closing
  when the cards are near home (spring.near), not at full rest.
- Regression test: tests/e2e/flicker.spec.mjs samples every frame (box, opacity, visibility, display,
  hit-test of the face, depth). Mutation check: with the old preset restored it fails ("drawer depth
  0.96px is behind the cabinet front"); with the fix it passes. Unit tests simulate 30/60/120/144 fps.
