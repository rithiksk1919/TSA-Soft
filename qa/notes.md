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

## Phase 2 findings (what, where, fix)
- Spine clicks did nothing in a fresh page (library.css). The scene, rig, shelf and row boxes are
  coplanar with the spines at z = 0 and won the 3D hit test, so mousedown/up landed on the row.
  Fix: scenery is pointer-events: none, only .slot takes the pointer. Also (library.js) the hover
  lift moves the book under the cursor mid-press; open on pointerup when the press began on a book
  and moved < 12px; keyboard activation still uses click.
- Open book did not trap focus (library.js, ui.js). Fix: ui.isolate makes everything else inert and
  wraps Tab / Shift+Tab inside the top layer; the reader is role="dialog" aria-modal.
- Fan stacks sorted wrong after raising the card step to 46px (cabinet.js): rising at the 18deg
  pitch brought cards closer faster than the 14px depth step pushed them back. Fix: depth step =
  step * sin(18deg) + 8.
- spring.jump() left awaiting promises unresolved (spring.js): a superseded move could hang a
  sequence forever. Fix: jump releases waiters.
- Test harness: settle() could return in the 250ms pause before the pop. Fix: also wait for the
  drawer to leave opening/closing and stay quiet across two checks.
- Label in name (WCAG 2.5.3, axe label-content-name-mismatch): spine, drawer, fan card and arrow
  names did not contain their visible text. Fix: drawers and fan cards take their name from their
  content (+ screen-reader-only context); spines keep the spec's "Open the X book" label and paint
  their lettering from data-text (score via aria-describedby); arrow label "Practice them: go to ...".
- Focus trap Tab order (ui.js): tabbables were listed in the order the kept nodes were passed,
  not document order, so Tab could escape from the last fan card. Fix: sort by document position.
- Camera move frame time (cabinet.js): writing --p on the stage each frame restyled both scenes
  (custom properties inherit). Fix: write the three layer transforms directly; --p is written once
  the move settles. 4x throttled camera move: 31.5 -> 46.9 fps (harness overhead also removed).
- Fan cards get will-change: transform only while a choreography runs (+1.5 fps).
- Missing features the checklist assumed (from the truncated earlier prompt), built in Phase 2:
  multiple-choice cards verified instantly; three-box Leitner trays (nextBox) with counts in the bar
  and sheet; "Review N cards" per mistake and "Review All"; end screen with Review Again and Back to
  Drawer; segmented Learn | Practice toggle and bottom sheets under 820px; flat (no 3D) cabinet under
  820px and with reduced motion; focus traps for the book, the drawer, the sheet and the review.
- Data: flashcards moved to data/cards.json (6 mistakes x 2 cards) to match Phase 3's "6 mistakes
  from data/cards.json"; drawer labels moved to data/drawers.json.
