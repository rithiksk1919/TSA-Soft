# SkillBridge Library: overnight report

## 1. Summary

All four phases are done and each one is committed (`git log`). Phase 0 added the test harness: Playwright e2e tests, `node --test` unit tests, and pure logic moved into `logic.js`. Phase 1 fixed the drawer-close flicker. The cause was the closing spring overshooting past "closed", which put the drawer face behind the cabinet front. Phase 2 was a full QA pass. It fixed eleven real bugs and built the features the checklist assumed but the page didn't have yet:

- the Leitner trays and multiple-choice cards
- "Review N cards" and "Review All"
- the end screen
- the Learn | Practice toggle and bottom sheets below 820px

Phase 3 built the five remaining drawers on mock data: Mistakes index, Worked examples, Diagnostic, History and Learned. They share one state store, so every count updates everywhere. Phase 4 added cross-drawer and scene sequence tests, which found three more bugs, all now fixed. The full suite ran twice in a row: **40/40 unit tests and 70/70 e2e tests passed both times, with no flaky tests.**

## 2. The drawer-close flicker: root cause and fix

**Symptom:** when a drawer closes, it disappears for a moment and then comes back.

**Root cause:** the drawer travels on the `drawer` spring (stiffness 170, damping 20, damping ratio 0.77), which overshoots its target by about 2.3%. Over a 260px pull-out, that means the closing drawer passes "closed" by up to about 6px. At rest the drawer face sits only **1px in front of the cabinet front**, and the cabinet front is opaque, with a dark cavity painted behind each drawer. Any overshoot over 1px pushes the face behind the cabinet front, so the slot looks empty until the spring swings back.

The overshoot depends on frame rate, which is why it shows on a real display but barely at all in headless Chrome. Simulated with the same integrator as the page (`tests/unit/spring.test.cjs`):

| Frame rate | Overshoot past closed | Face hidden behind the cabinet |
|---|---|---|
| 144 / 120 fps | -3.85px (120 fps) | **233 ms** at 120 fps |
| 60 fps | -1.87px | 150 ms |
| 30-40 fps (headless) | 0 to -0.44px | 0 ms |

A second problem made it look worse: closing waited for every card spring's long tail before the drawer moved. That left the drawer out and empty for about 0.6s, which read as "gone, then back".

Of the suspects in the brief:

- (a) hidden or display:none at the start of the close: not the cause.
- (b) a state flag flipped early: not the cause.
- (c) two motions fighting: partly. Hover and open both drive the same transform, but they add together, so they don't fight. Staggered card starts from a superseded animation could still fire, though; those now carry a token.
- (d) a flattening ancestor: not the cause.
- (e) the scrim updated on a different frame: not the cause. The scrim comes from the same render.

**Fix:**

- **A physical stop at closed.** `logic.stepSpring` gained optional min/max stops with restitution. A new `PRESETS.drawerTravel` preset is the drawer spring plus a stop at 0 (restitution 0.18), used for both the open and the hover travel. The drawer can no longer pass into the cabinet; it taps the stop.
- **Retargetable open and close.** Open and close run as one sequence each, sharing a token. Starting either one supersedes the other and retargets the same springs, keeping their velocity, rather than stacking a second animation. Esc during the open closes the drawer. Clicking during a close re-opens it from where it is.
- **No idle wait.** The drawer starts closing as soon as the cards are near home (`spring.near`), not when they're fully at rest. State flags still change only at the very end, and nothing is hidden or re-rendered during the motion.
- **Regression test:** `tests/e2e/flicker.spec.mjs` checks all 6 drawers, plus a rapid open/close/open with Esc mid-open. On every frame it samples the face's box, opacity, visibility and display, the jump between frames (must be at most 80px), a hit test of the face, and its depth (must stay at least 1px). A mutation check confirms the test catches the bug: with the old preset put back, it fails with "drawer depth 0.96px is behind the cabinet front". Traces are in `qa/traces/flicker-*.json`.

I could not see the flicker by eye in headless Chrome (see section 6, item 1). The diagnosis rests on the depth trace and the simulation.

## 3. Bugs found and fixed

| # | What | Where | Fix |
|---|---|---|---|
| 1 | Drawer face slips behind the cabinet front on close (the flicker) | `spring.js`, `logic.js`, `cabinet.js` | A stop at closed (`drawerTravel`); retargetable sequences |
| 2 | A spine click did nothing in a fresh page: the scene, rig, shelf and row are coplanar with the spines at z = 0 and won the 3D hit test | `library.css` | Scenery is `pointer-events: none`; only `.slot` takes the pointer |
| 3 | A quick click lost: the hover lift moves the book under the pointer between mousedown and mouseup | `library.js` | Open on pointerup when the press began on a book and moved less than 12px; keyboard still uses click |
| 4 | The open book didn't trap focus | `library.js`, `ui.js` | `ui.isolate`: everything else inert, plus Tab wrapping; the reader is `role="dialog" aria-modal` |
| 5 | The focus trap listed focusable elements in argument order, so Tab escaped from the last fan card | `ui.js` | Sort into document order |
| 6 | Label-in-name (WCAG 2.5.3, axe): spine, drawer, fan card and arrow names didn't contain their visible text | `library.js`, `cabinet.js`, `index.html` | Names come from content, with screen-reader-only context; spines keep "Open the X book" and paint their lettering from `data-text`; arrow label is "Practice them: go to ..." |
| 7 | Fan stacks drew in the wrong order: at the 18° pitch, rising brought cards closer faster than the depth step pushed them back | `cabinet.js` | Depth step = rise × sin 18° + 8px |
| 8 | Card text hidden: a `<button>` centres its content vertically | `cabinet.css` | Catalog-card buttons lay out from the top |
| 9 | `spring.jump()` left awaiting promises pending, so a superseded move could hang a sequence | `spring.js` | `jump` releases waiters |
| 10 | Camera move cost: writing `--p` on the stage every frame restyled both scenes (custom properties inherit) | `cabinet.js` | Write the three layer transforms directly; `--p` is set once at rest |
| 11 | Bottom-row drawers opened partly below the fold and under the footer | `cabinet.js`, `cabinet.css` | Lift lower rows to the top row's height; the world stacks above the footer |
| 12 | Clicking another drawer while one was closing was swallowed: the panel's trap stayed on until the close finished, and the departing tray covered the drawers | `panel.js` | Release the trap and make the tray click-through as soon as the close starts |
| 13 | Re-opening a panel drawer mid-close left the state at "panel" with no panel showing | `panel.js`, `cabinet.js` | The panel supports reopen: cancel the close and spring back in, keeping its contents |
| 14 | A click on another drawer during a close was ignored | `cabinet.js` | It's queued and opens as soon as the first drawer is home |
| 15 | Test harness: `settle()` could return in the 250ms pause before the pop | `tests/e2e/helpers.mjs` | Also wait for the drawer to leave its transitional states, quiet across two checks |

## 4. What each new drawer does

These were built in Phase 2 because the checklist expected them:

- **Flashcards:** 12 multiple-choice cards over 6 mistakes, each checked as soon as you answer. A three-box Leitner system (To review, Learning, Learned), driven by `nextBox`: right moves a card up one box, wrong sends it back to box 1. Tray counts show in the bar and in the sheet. There's "Review N cards" per mistake and "Review All" per filter. The end screen offers Review Again and Back to Drawer. Saved in `localStorage` under `sb_cards`.

Phase 3 built the other five. All of them use the same choreography: the drawer slides out on the drawer spring, the room dims through a scrim sibling, the contents pop in staggered, Esc steps back a level or closes, and focus returns to the drawer button. All of them become bottom sheets below 820px.

- **Mistakes index:** the 6 mistakes under subject dividers, sortable by Most frequent or Most recent. Each card shows its call number (for example `PHY.NEW.001`), the skill, "made N times", "last seen" and a frequency bar relative to the subject's most frequent mistake. The detail view has a plain explanation, a wrong-vs-right pair, **Review These Cards** (opens Flashcards on that mistake and starts the review) and **Open the Book** (goes to the shelf and opens that subject's book).
- **Worked examples:** one per mistake. A stepper reveals 4 or 5 steps one at a time (Next Step button or the Right arrow key). The step where the mistake happens has an outline, a "Common mistake here" label and a "Watch for" note. A check-yourself question at the end answers "Correct" or "Not quite". Every derivation is written out in `data/worked.json` and checked in `tests/unit/data.test.cjs`.
- **Diagnostic:** 15 questions, 5 per subject. It shows "Question N of 5" and gives no hints. Answers are checked as you go, but results appear only at the end. The results screen shows per-skill bars from `diagnosticMastery` = clamp(0.3 + 0.7 × difficulty-weighted share correct), level labels, the weakest skill, and "Starting mastery is set from these results". Results are saved to `sb_diagnostic`, and there's a Retake button.
- **History:** 12 attempts under month dividers, filterable by subject and by result. A summary strip shows attempts, solved %, average hints and solved-with-no-hints. Each card shows its outcome score from `outcomeScore` (with the 0.4 floor). The detail view shows a mono timeline of the recorded edit, run, hint and submit actions.
- **Learned:** reads the Flashcards boxes from the same store (not a copy). It lists the mastered skills (Periodic trends, Cell structure) with an ink stamp, "Verified · transfer passed", that presses in once on first view; with reduced motion it simply appears. Learned cards have a detail view and **Move Back to Learning**, which updates every count immediately. The empty state reads "No cards learned yet...".

The cabinet label cards show live counts: 12 cards, 6 mistakes, 6 examples, 15 questions, 12 attempts, and the number of learned cards.

## 5. Test results (all run, twice)

| Suite | Count | Run 1 | Run 2 |
|---|---|---|---|
| Unit (`node --test`) | 40 | 40 passed | 40 passed |
| E2E (Playwright, Chromium 1.64) | 70 | 70 passed (15.3 min) | 70 passed (15.1 min) |

Logs: `qa/run1.log`, `qa/run2.log`. No retries are configured, so no test passed on a second attempt.

- **Unit tests cover:** averages, levels, all 6 `nextBox` transitions, Leitner counts, the spring stop at 30/60/120/144fps, preset damping ratios, `outcomeScore` (including the floor), `diagnosticMastery` (all right, all wrong, mixed, zero difficulty), sorting, summaries, and data integrity including the arithmetic in every worked example and diagnostic question.
- **E2E covers:** smoke (no console errors, no failed requests, all fonts local, offline with every non-local request blocked), shelf and books, the scene transition (reversal, 10 rapid clicks, crossfade, parallax ratios, inert timing), flashcards, all five new drawers, flicker for all six drawers, accessibility (axe at 3 widths and in every drawer and detail view, a contrast script covering 110–140 text elements per width, a keyboard-only path, focus traps), reduced motion, 390px and 820px layouts, cross-drawer sequences, persistence across a reload, blocked storage, CLS, and fps.

**Frame rate**, headless Chromium with 4× CPU throttling (`qa/perf.json`):

| Sequence | Average fps |
|---|---|
| Book open (1.9s) | 57.6 |
| Drawer close | 53.8 |
| Flashcards drawer open + pop | 46.2 to 47.9 |
| Camera move to cabinet | 42.3 to 46.9 |

Every sequence meets the ≥40fps floor. The camera move and drawer open miss the 50fps target. Layout shift on load (CLS) is 0.

## 6. Not fixed, or assumed (most important first)

1. **The flicker was never seen by eye.** Headless runs at about 30–40fps, where the spring hardly overshoots. The root cause comes from the per-frame depth trace (minimum 0.76px, under the 1px gap) and the simulation at 120fps. Please check on your own display, ideally 120Hz or higher.
2. **The 50fps target is missed** by the camera move (42–47fps) and the drawer open (46–48fps) at 4× throttling in headless software rendering. The 40fps floor holds. Nothing was measured on a real Chromebook.
3. **Missing parts of the earlier prompt.** It was cut off, so I designed the Leitner trays, multiple-choice cards, Review N / Review All, the end screen and Back to Drawer myself.
4. **Data was consolidated.** The flashcards now have the 6 mistakes your brief named (2 cards each), in `data/cards.json`. The old `data/flashcards.json` (8 mistakes) was removed. "Review These Cards" starts the review directly.
5. **`--p` is only written at rest.** The layers move by direct transforms during the camera move, for performance (bug 10). The CSS still reads `--p`, so the resting state is correct.
6. **"No 3D below 820px".** The camera, cabinet, drawers and book opening are all flat there. The shelf books keep their static 3D, which the earlier spec allowed.
7. **Spine lettering is CSS generated content.** This lets the spines keep the spec's `aria-label` and still pass label-in-name. The score is announced through `aria-describedby`.
8. **One Playwright workaround.** Playwright's actionability check never settles on a 3D-transformed divider button, though the hit test finds it. That one test clicks the divider tab by its coordinates.
9. **No DESIGN.md exists** in the repo. I followed the tokens in your prompts and the Taste Skill.
10. **Not in git:** `.agents/` and `.aider-desk/` (agent tooling) are in `.gitignore`.
11. **The published page is out of date.** The artifact link from earlier still shows the pre-overnight version.
12. **Mock history is approximate.** Each attempt's count of runs is mock data and doesn't always match its "attempts" number exactly.

## 7. How to run

- **First time only:** `npm install` then `npx playwright install chromium`.
- **App:** `npm start`, then open http://127.0.0.1:5180/
- **Tests:** `npm test` (unit, then e2e). Or separately: `npm run test:unit`, `npm run test:e2e`.

## 8. Screenshots in `qa/screens/`

Each state is captured at 390, 820 and 1360px (33 files: `<state>-<width>.png`):

- `01-shelf`
- `02-book-physics`
- `03-cabinet`
- `04-drawer-flashcards`
- `04-drawer-index`
- `04-drawer-worked`
- `04-drawer-diagnostic`
- `04-drawer-history`
- `04-drawer-learned`
- `05-review-front`
- `05-review-back`
