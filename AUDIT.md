# UI performance and smoothness audit

Branch: `ui-perf-audit`. Scope: every UI file in the app (`static/library/`) plus the files that decide how it is loaded.

Stack: plain HTML, CSS and JavaScript with no framework, no bundler and no linter. All artwork is CSS or inline SVG (no raster images); the fonts are self-hosted woff2. "Re-render" findings below mean DOM rebuilds (`innerHTML`), because there is no virtual DOM. "Build/lint" for this project means `node --check` on every script, plus the unit and Playwright suites.

Severity: **high** = can visibly drop frames or shift layout on a normal laptop; **medium** = wasted work or jank on slower devices; **low** = hygiene or a small win.

Each finding has an ID and a status: `fixed (<commit>)`, `explained` (left as is, with the reason) or `open`.

Method: each area was read in full by a reviewer (five in parallel), and every high finding was then re-checked against the code by hand before fixing. Line numbers are from commit `76c8fad`. Every fix was verified for "no visual change" with pixel diffs or behaviour probes (in `qa/probes/`), and every performance claim was measured, interleaving the old and new code, before it was kept. Three attempted fixes measured no gain or a regression and were reverted (RJ1 culling, RC1, DK2).

## Results

- 23 of 23 files reviewed and ticked; 94 findings (4 high, 37 medium, 53 low): **41 fixed, 53 explained, 0 open**.
- High: IX1 (flash of the flat page on load) fixed; DH1/DC-1 (dashboard layout shift) fixed, **CLS 0.34 / 0.60 / 0.68 → 0.003 / 0.005 / 0.014** at 1440 / 1100 / 390; RJ1 (room layer count) explained (needs a design decision).
- Frame rates, `tests/e2e/perf.spec.mjs` (software rendering, 4× CPU throttle), before → after: camera move to the cabinet **~42 → ~54 fps**, flashcards drawer open **~45 → ~51 fps**, drawer close **~52 → ~55 fps**; book open unchanged (52–57).
- Bugs found and fixed along the way: worked-example steps flashed on the last reveal (DJ1); a closed Flashcards view could rewrite a different open panel (DJ2); the desk opened with a one-frame size jump (DK1); a NUL byte in my own earlier CSS fix (f2f512a).
- Checks after the last batch: `node --check` on every script passes; unit tests 42/42; Playwright **97/98** — the one failure ("reverse mid-move keeps velocity", a fixed 32 ms timing window) then passed 8/8 on re-run. Earlier in the audit the wide-screen room Practice test failed once (it also failed before the audit) and passed 3/3 on re-run.

### Check on real hardware (cannot be verified from code here)

- The room (RJ1): frame rates on integrated GPUs and phones, DevTools Rendering → Layer borders and the Performance panel during flights and pointer-look. If it drops frames, the fix is a design change (fewer books or pre-painted shelf planes).
- GPU memory of the desk's 2200 px light spot (DS1) and the room's layers: DevTools Layers panel.
- Phone layouts with a real touch device: the bottom sheet (PN1), review overlay scrim (DC3) and flat-sheet rebuild behind review (DJ3).
- Production hosting: caching headers and compression (SV1, SV2) — the dev server sends `no-store` and no compression by design.

## Inventory

### Library room (3D home, camera and stations)
- [x] static/library/index.html
- [x] static/library/room.js
- [x] static/library/room.css
- [x] static/library/spring.js
- [x] static/library/ui.js

### Bookshelf and book reader (Learn)
- [x] static/library/library.js
- [x] static/library/library.css
- [x] static/library/interiors.js
- [x] static/library/panel.js

### Card catalog, drawers and flashcards (Practice)
- [x] static/library/cabinet.js
- [x] static/library/cabinet.css
- [x] static/library/drawers.js
- [x] static/library/drawers.css
- [x] static/library/review.js

### Reading desk (Apply)
- [x] static/library/desk.js
- [x] static/library/desk.css

### Shared state and logic
- [x] static/library/state.js
- [x] static/library/logic.js

### Dashboard
- [x] static/library/dashboard.html
- [x] static/library/dashboard.css
- [x] static/library/dashboard.js

### Data and serving (affect load time, parsing and caching)
- [x] static/library/data/*.json (9 files, 59 KB total, largest desk.json 17 KB)
- [x] scripts/serve.mjs

## Findings

### static/library/index.html (298 lines)
- **IX1 high** L161 — `#room` ships with `hidden` and is only shown by room.js, the last of 12 synchronous scripts at the end of `<body>`. On a cold load the browser can paint the flat "Learn your mistakes" page before the room covers it: a flash of the wrong screen. — status: fixed (207c347)
- **IX2 medium** L9–10 — Only Source Serif 600 and Plex Sans 400 are preloaded; the first screen also uses Plex Mono 400 and Plex Sans 500 (`font-display: swap`). Late fonts cause FOUT, and room.js re-frames the camera on `fonts.ready`, so the 3D scene can jump. — status: fixed (7992628)
- Checked: dialogs start hidden; scripts at end of body.

### static/library/room.js (812 lines)
- **RJ1 high** L18–73, L770–776 — The room is one `preserve-3d` context of several hundred 3D-transformed faces (72 shell tiles, ~80 shelf books × 3 faces plus bands, furniture). Every camera frame (`applyCamera`, L395–409) re-projects and composites all of them; the main frame-drop risk on integrated GPUs. — status: explained. Measured with the GPU on: flights 47–57 fps, pointer-look ~46–55, station hover ~41–45 at 1440×900 (they vary run to run with machine state; baseline and fixed builds measure the same when interleaved). Tried culling faces no pose can see: only 7 of 521 can be dropped safely, because the overview's safe-zone shift raises the eye by a window-dependent amount, so it was reverted. A real cut needs a design change (e.g. merging the shelf's ~80 books into a few pre-painted planes, or fewer books), which changes the look; left for you to decide. Check with DevTools Rendering > Layer borders and the Performance panel on target hardware.
- **RJ2 medium** L708–750 `safeFrame` — Interleaved writes and `getBoundingClientRect` reads (sign scaling passes, then up to 4 camera writes each followed by measuring every plaque): ~6–10 forced layouts per call; runs on boot, `fonts.ready` and every resize. — status: fixed (c46d759)
- **RJ3 medium** L679, L779 — Two unthrottled `resize` listeners; in practice state `alignCabinet()` runs twice per event, plus `safeFrame`. — status: fixed (aea8478)
- **RJ4 medium** L604–636 `alignCabinet`/`enterPractice` — ~5 forced layouts plus a root class toggle on the hand-off frame, repeated the next frame. — status: explained. One burst of measurements on the single frame where the room hands over to the working cabinet; it lines the cabinet up with the room's catalog from live geometry, so reordering it risks a visible misalignment. The room Practice tests cover this hand-off; profile it on a slow device before changing it.
- **RJ5 medium** L809 — `fonts.ready → safeFrame` snaps a new `frameShift` onto the camera after fonts swap: the scene jumps. — status: fixed (7992628): the late fonts are now preloaded, so fonts.ready no longer changes the frame
- **RJ6 medium** L465/494, L512–518 — The away-state room uses `hidden` (`display:none`), so returning rebuilds and re-rasters hundreds of layers on the first frame of the crossfade. — status: explained. Keeping the room rendered while away (visibility instead of hidden) would keep ~500 3D layers alive under the flat scenes and the desk, costing memory and compositing all the time to save one frame on return; tests and code also rely on room.hidden. Worth profiling on a low-end device before deciding.
- **RJ7 low** L533–537, L441–444 — `pointerover` on the world re-queries `.station3` and `.rnav__btn` on every face crossing. — status: fixed (024d281)
- **RJ8 low** L682–686, L778 — `setInterval(tick, 1000)` runs forever, even while the room is hidden or the tab is in the background; 3 `querySelector`s per tick. — status: fixed (fd51ae2)
- **RJ9 low** L404–409, L416 — New pose object per camera frame; `fly.near()` adds a second rAF poll. — status: explained. A small object per camera frame and one extra rAF check during flights; not measurable (flights held 55–57 fps with the GPU on).
- Checked: all motion is transform-only via rAF springs; pointer-look is rAF-coalesced and stops when settled; `syncCatalogLabels` writes only on change.

### static/library/room.css (410 lines)
- **RC1 medium** L241–243 — `.glow3--edge`, a ~560×770 3D plane with `box-shadow: 0 0 80px 50px`, toggles `display:none ↔ block` on hover: re-raster of a large blur per station hover. — status: explained. Measured: keeping the edge glow rendered at opacity 0 (no re-raster on hover) made pointer-look worse (53–55 → 43–46 fps) and did not help hover, confirming the original trade-off (display:none keeps it out of the per-frame 3D sort). Replacing the blur with a gradient would change the look.
- **RC2 low** L205/219, L223/228 — `background-color`/`box-shadow` transitions on catalog drawers and plaques repaint textured 3D layers (small surfaces). — status: explained. Short (160–200 ms) colour transitions on small surfaces, only on hover; the fix (pre-painted overlays) adds DOM to every catalog drawer for no measurable gain.
- **RC3 low** L389–390 — opacity transitions on each `.cat-deco` face; can't move to the group without flattening preserve-3d. — status: explained. Already the correct approach: opacity on the preserve-3d group would flatten it.
- Checked: no `transition: all`, no layout-property animation, the vignette is one static `::after`, reduced motion respected.

### static/library/spring.js (108 lines)
- **SP1 low** L90–98 — each `near()` caller starts its own rAF polling loop alongside the spring's loop. — status: explained. The extra per-caller rAF poll is cheap and bounded by the motion; reworking the spring's waiter model touches every animation for no measured gain.
- Checked: loops stop at rest, dt clamped, `jump` cancels rAF, reduced motion short-circuits.

### static/library/ui.js (137 lines)
- **UI1 low** L87–109 — focus trap measures every focusable (`getBoundingClientRect` + `getComputedStyle`) on each Tab. Keyboard-only, not during animation. — status: explained. Runs only on Tab inside a focus trap, never during animation.
- Checked: `ui.fade` is WAAPI opacity; media listeners use `change`.

### static/library/library.js (608 lines)
- **LJ1 medium** L248–270, L436–438, L488–495 — open/close does a burst of forced style/layout (rect reads after `innerHTML`, `display` and transform writes) in the click handler before the first animation frame. — status: explained. The book open/close measures geometry in the click handler before its single WAAPI timeline starts. Book open measures 52–57 fps under 4× CPU throttle (perf.spec) and the measurements are needed to build the flight; restructuring the FLIP math risks the hand-off from the room's shelf.
- **LJ2 medium** L444–445, L522–523 (with library.css L448) — `is-flying` stays on slot and reader for the whole time a book is open, so the infinite SVG logo animations (cover, hidden shelf spine) keep running on the main thread while reading. — status: fixed (8a3b0ac): running logo animations while reading 12 → 3
- **LJ3 low** L506–510 — rAF loop polls `currentTime` until the close hand-off (~700 ms). — status: explained. A rAF poll for ~0.7 s during a close from the room; harmless.
- **LJ4 low** L552–556 — `openBook` polls `atShelf()` every frame for up to 300 frames. — status: explained. A rAF poll (bounded, 300 frames) while the camera arrives; harmless.
- **LJ5 low** L289–301 — dimming starts ~7 opacity animations per book. — status: explained. Fine at 3 subjects (the reviewer's note); revisit if subjects grow.
- **LJ6 medium** L591 — fetches `data/subjects.json`, which state.js already fetches: a duplicate request and parse on every load (and `no-store` means it is never served from cache). — status: fixed (276245e)
- Checked: parallax rAF stops when settled; `pointermove` passive; open/close is one WAAPI timeline on transform/opacity; `will-change` only during flight.

### static/library/library.css (793 lines)
- **LC1 low** L356–370 — `.contact` shadows use `filter: blur(7px)` on 3D layers (3 books). — status: explained. A blur filter on 3 small contact shadows; replacing it with a gradient changes the shadow's look.
- **LC2 low** L447–448 — the CSS half of LJ2. — status: fixed (8a3b0ac)
- **LC3 low** L272–280 — SVG `feTurbulence` noise as background on several pseudo-elements per book. — status: explained. Decoded once and tiled; swapping in a raster tile changes the texture.
- Checked: all motion transform/opacity; fixed scene height so no layout shift when the shelf fills.

### static/library/interiors.js (280 lines)
- **IN1 medium** L270–274 — every drawer open clears and rebuilds all interior pieces (up to ~30 3D planes, one `appendChild` each) in the same task that starts the drawer spring. — status: explained. Rebuilds at most ~30 small pieces per drawer open; drawer open measures 50–53 fps under 4× CPU throttle after CC1. Caching interiors needs invalidation on every store change; not worth the risk now.
- **IN2 low** L28–35 — per-frame object and string allocation per piece, one rAF callback per piece. — status: explained. Minor per-frame allocations during short motions.
- **IN3 low** L73–77, L162–166, L203–205 — staggers use `setTimeout`, not frame-aligned. — status: explained. Stagger timing, not frame drops.
- Checked: transform/opacity only; springs re-target without stacking; data is small, no virtualization needed.

### static/library/panel.js (168 lines)
- **PN1 medium** L18–31 — the sheet (up to 800 px with a large blurred shadow) and, on phones, the full-screen scrim are animated through inline 2D transform/opacity with no `will-change`: likely repainted every frame. — status: fixed (88fb2bc): will-change only while moving; resting rendering unchanged
- **PN2 medium** L22 — `sheet.offsetHeight` is read inside the per-frame spring callback, after other springs wrote styles: a forced style recalc every frame of the bottom-sheet slide. — status: fixed (88fb2bc)
- **PN3 low** L34–55 — `.pop` items animate 2D transforms on their own springs (repaints of the sheet body). — status: explained. Short staggered pops; drawer open measures 50–53 fps under 4× CPU throttle.
- **PN4 low** L59–61 — `drop()` picks items by window position, not the scroll body's visible area. — status: explained. Only matters for very long lists; current views are short.

### static/library/cabinet.js (786 lines)
- **CJ1 medium** L35–37 — the camera writes transforms on `#track`, the wall layer (2.3× wide) and the floor layer (2.9×, holding a blurred shadow) every frame, with no promotion: likely repaints the stage every frame of the ~1.1 s move. — status: fixed (e8a52f8): camera move 41.5–43.1 → 43.8–45.4 fps (perf.spec, 4× CPU)
- **CJ2 medium** L46–47 — heading `opacity` written every camera frame, headings not promoted. — status: fixed (e8a52f8)
- **CJ3 medium** L303–319 — `syncBar()` → `updateCounts()` rebuilds trays `innerHTML`, rewrites 6 labels and each fan card's state text (inside composited cards) on the first frame of every card choreography, even when nothing changed. — status: explained. Counts are rewritten at the start of card choreographies; with the current data (12 cards) this is a few text writes. Revisit with real extension data volumes.
- **CJ4 low** L496–506 — two `near()` pollers per moved card. — status: explained. Extra rAF checks per moving card in the tail of a motion; cheap.
- **CJ5 low** L229–233, L461 — `<html>` class toggle at the start of choreographies. — status: explained. One root class toggle per choreography; room CSS selectors depend on it being on <html>.
- **CJ6 low** L759–767, L119–128 — resize reads/writes then re-reads; boot computes geometry twice. — status: explained. Resize is already debounced (120 ms); the extra measurement happens once per resize.
- **CJ7 low** L64–65 — both scenes set `visibility: visible` on the first frame of a camera move. — status: explained. Needed so the far arrow can reverse a move mid-flight; camera move now measures 54–55 fps under 4× CPU throttle.
- Checked: transforms only per frame; `--p` written only at rest; hover via pointerenter/leave; resize debounced.

### static/library/cabinet.css (661 lines)
- **CC1 medium** L307–311, L334 — drawer box planes (4 × 6) stay rendered while drawers are closed and hidden behind their fronts, adding 3D layers to every camera frame. The rule that hides them exists only in room practice mode (room.css L386). — status: fixed (7ebca7f): camera move 43.8–46.2 → 51.5–53.8 fps, drawer open 44.6–46.2 → 50.1–52.8 (perf.spec, 4× CPU)
- **CC2 medium** L77–86 — `.floor-shadow` `filter: blur(9px)` inside a layer that moves every camera frame (see CJ1). — status: fixed (e8a52f8): its layer is promoted during moves
- **CC3 low** L222–232 — `.cab__scrim` is a 3960×3180 3D plane kept rendered at opacity 0. — status: fixed (6852991): camera move 53.1–53.9 → 54.6–55.4 fps
- **CC4 low** L255, L278 — `background-color` hover transitions on textured drawer faces. — status: explained. Short hover colour transitions on small faces.
- **CC5 low** L487–489 — dead `.review`/`.review__scrim` rules (overridden by drawers.css). — status: fixed (7322249)

### static/library/drawers.js (490 lines)
- **DJ1 medium** L243–248 — `showCheck()` pops the whole `.detail`, which resets every step already shown to opacity 0 and re-animates it: visible content flashing. — status: fixed (d4bb43b): earlier steps' minimum opacity after the last reveal 0.00 → 1.00
- **DJ2 medium** L13–20, L85 — `live()` subscriptions outlive their panel; a later store emit can rebuild a stale flashcards view's `innerHTML` before the new view overwrites it. — status: fixed (0760c37): it was a real bug — a store change rewrote the open Index panel with Flashcards HTML (1 rewrite → 0)
- **DJ3 medium** L72–76 — with the flat Flashcards sheet open, each review answer rebuilds the sheet behind the overlay on the first frame of the card flip. — status: explained. Only in the phone layout with the flat Flashcards sheet open behind the review overlay; deferring the rebuild changes when counts update. Profile on a phone first.
- **DJ4 medium** L91, L68, L238 — `pop(body)` animates every `.pop` node (15–25 in Index/History) with its own spring and poller. — status: explained. Limiting the stagger to the first screen changes the animation's look; it is short and drawer open is 50–53 fps under throttle.
- **DJ5 low** L376–383 — O(n²) month counting with `Intl` per row. — status: fixed (097a895)
- **DJ6 low** L266–269 — `body.onkeydown` left on the shared body by some exits. — status: fixed (0760c37)
- Checked: data sets small (no virtualization needed); listeners bound once per render on fresh nodes.

### static/library/drawers.css (416 lines)
- **DC1 medium** L165–180 — CSS half of PN1: `.sheet` animated without `will-change`. — status: fixed (88fb2bc)
- **DC2 low** L156–162 — full-viewport `.sheet-scrim` opacity animated, not promoted. — status: fixed (88fb2bc)
- **DC3 low** L235–236 — full-viewport `.review__scrim` opacity animated, not promoted. — status: explained. Opacity on the review scrim during the card fly-in; full-viewport but a single opacity layer. Profile on a phone before promoting it (will-change would also change text rendering in the overlay).

### static/library/review.js (201 lines)
- **RV1 medium** L120–131 — `store.answer()` emits synchronously to all subscribers (cabinet counts, flat sheet rebuild) just before the card flip starts. — status: explained. Changing when store.answer() emits changes the order of side effects in review; risky for a first-frame cost on 12 cards.
- **RV2 low** L25–27 — FLIP measure forces a layout once per open/exit. — status: explained. One FLIP measurement per open/exit; required.
- **RV3 low** L17–23 — fly card not explicitly promoted while it scales. — status: explained. The flying card is a preserve-3d element and is composited already; will-change would change text rendering.
- Checked: one keydown listener; transform/opacity only; reduced-motion fallback.

### static/library/desk.js (681 lines)
- **DK1 medium** L57–84, L629–630 — `open()` calls `fit()` before `start()` renders the paper, so stage height and the wall/floor split are measured on an empty desk and stay wrong until a resize, which then jumps. — status: fixed (3799e88): it was a one-frame jump at open (stage 348 px, then 694 px)
- **DK2 medium** L287–298, L253 — streaming text: `textContent` + `scrollHeight` read + `scrollTop` write every 16 ms on a `scroll-behavior: smooth` log, restarting the smooth scroll each tick (stuttering scroll). — status: explained. Measured (probe-desk-stream): the log moves 12 times while streaming, all forward but one, and ends at the bottom; no stutter. Jumping instead of smooth-scrolling would be a visible change.
- **DK3 medium** L50–54 — `pointermove` reads `getBoundingClientRect` per event and each `yaw.to()` pushes a new promise into the spring's waiting list until it rests. — status: fixed (17b6561)
- **DK4 medium** L41–48, L87–90 — the tutor ResizeObserver writes `--dock-h` and runs `fit()` (forced layouts, root custom-property writes) on every streamed line, even when unchanged. — status: fixed (f9b9179): fit runs 4 → 3 at 1440, unchanged when docked (where it is needed)
- **DK5 low** L47–48, L103–104 — two springs paint the same element twice per frame. — status: explained. A duplicate style write per frame while two springs overlap; cheap.
- **DK6 low** L107–128 — `point()` measures offsets right after DOM writes on each message. — status: explained. One layout read per tutor message, not per frame.
- **DK7 low** L359, L395 — `scrollIntoView({smooth})` concurrent with other animations. — status: explained. Smooth scroll of the desk only when a card is dealt; brief.
- **DK8 low** L605–614 — `desk.json` loads on first open with no loading state; a failed load is cached forever. — status: explained. desk.json (17 KB) loads in milliseconds locally; a loading state and retry are behaviour changes for the extension wiring to decide.
- Checked: springs stop at rest; motion is transform/opacity; handlers reassigned not stacked; localStorage written once per scenario.

### static/library/desk.css (483 lines)
- **DS1 medium** L225–231 — `.dk-spot` is a 2200×2200 `will-change` layer (≈60–80 MB texture at DPR 2) composited every frame the spot moves. — status: explained. Chrome rasterizes only the visible tiles of a large layer plus a margin, not the full 2200² texture, so the 60–80 MB estimate is likely high; shrinking it and scaling 2× would also render the gradient slightly differently. Check DevTools Layers (memory estimate) on target devices.
- **DS2 low** L151–157, L172–175 — `filter: blur()` on large 3D layers. — status: explained. Static blurs; replacing them with gradients changes the look.
- **DS3 low** L167 — `filter: brightness()` per book face. — status: explained. A static filter on 3 small faces.
- **DS4 low** L244/246, L322/326 — `box-shadow` transitions on paper/card. — status: explained. Short glow transitions on focus changes, once per tutor message.
- **DS5 low** L260 — color/opacity transitions on SVG groups. — status: explained. Small SVG; acceptable per the reviewer.
- **DS6 low** L397 — `scroll-behavior: smooth` on the log (CSS half of DK2). — status: explained. See DK2.

### static/library/state.js (180 lines)
- **ST1 medium** L155–157 — boot fetches 7 JSON files; `subjects.json` is fetched again by library.js (LJ6). — status: fixed (276245e)
- **ST2 low** L45–61, L95 — `store.cards()` rebuilds every card object on each count/label refresh. — status: explained. 12 cards; rebuilding them per count is microseconds. Revisit with real data volumes.
- **ST3 low** L167–168 — `indexOf` in `forEach` (O(n²)). — status: fixed (f7a950e)
- Checked: localStorage written only on discrete actions.

### static/library/logic.js (182 lines)
- **LG1 low** L69–78 — `stepSpring` allocates a result object per spring per frame. — status: explained. Kept pure for the unit tests; the allocation is tiny.
- Checked: no DOM, timers or loops; sort copies first and is not per-frame.

### static/library/dashboard.html (161 lines)
- **DH1 high** L76–137 — every data region starts empty and fills after `fetch()` resolves: the hero stats, chart (0 → 276 px), tables and due list all push content down at once (layout shift). — status: fixed (09628b1, f2f512a): CLS 0.34/0.60/0.68 → 0.003/0.005/0.014 at 1440/1100/390
- **DH2 low** L75 — "Welcome back" is replaced by a longer greeting, which can wrap. — status: explained. The greeting is one line at all tested widths (1440, 1100, 390): the summary is what wraps, and its space is now held.
- **DH3 medium** L9–10 — Source Serif 600 (hero title, stat numbers) is not preloaded; FOUT on the largest above-the-fold text. — status: fixed (7f19ac0)
- **DH4 low** L159 — data request starts only after the script at the end of body runs. — status: explained. The fetch is local and small; CLS is now ~0 whatever its timing.

### static/library/dashboard.css (569 lines)
- **DC-1 high** L327–328 etc. — CSS half of DH1: no reserved space for the chart, stats, tables or due list. — status: fixed (09628b1)
- **DC-2 medium** L371, L377–380 — `.due__link` animates a blurred `box-shadow` with `translateZ` on hover. — status: fixed (0f54b52)
- **DC-3 medium** L203–204 — every cuboid renders all 6 faces, including faces never visible (bottoms, backs): ~80 3D layers. — status: fixed (d78e8b6): 78 → 39 face layers
- **DC-4 low** L232 — `filter: brightness()` on book back faces. — status: fixed (d78e8b6): the face is no longer drawn
- **DC-5 low** L421–425 — `--rx/--ry` set on `.diorama`, invalidating the whole subtree each pointermove; no `will-change` on `.world`. — status: fixed (caff1b0)
- **DC-6 low** L217–222 — `.book3d__link` animates transform without `will-change`. — status: explained. will-change on elements with text changes how the text is rasterized (measured: the drawers' labels shifted 1–2 px when it was added), which is a visual change; the transforms are short hover transitions on 3 elements, so it stays off.

### static/library/dashboard.js (373 lines)
- **DJS1 medium** L363–368 — `pointermove` reads `getBoundingClientRect` per event right after the previous style write; not rAF-coalesced. — status: fixed (caff1b0)
- **DJS2 medium** L111–118, L343–359 — first render interleaves writes and reads (two forced layouts) and the chart is drawn twice (sync, then the ResizeObserver's first callback). — status: fixed (c3a0265): chart draws on load 2 → 1
- **DJS3 medium** L348–351, L166–184 — the chart is rebuilt with `innerHTML` on every 1 px of resize, re-binding 8 listeners each time. — status: fixed (3c08f89)
- **DJS4 low** L177–180 — tooltip measures `offsetWidth` after unhiding. — status: fixed (3c08f89)
- **DJS5 low** L311 — search not debounced (fine at 11 rows). — status: explained. 11 rows; a debounce would only add input latency.

### static/library/data/*.json (59 KB in 9 files)
- **DA1 medium** subjects.json fetched twice (same as LJ6/ST1). — status: fixed (276245e)
- **DA2 low** desk.json loaded lazily with no loading state (same as DK8). — status: explained. See DK8.
- **DA3 low** author-only `_note`/`_derivation` fields shipped (~2–3 KB). — status: explained. ~2–3 KB of author notes; stripping needs a build step this project does not have.

### scripts/serve.mjs (28 lines)
- **SV1 low** L22 — `cache-control: no-store` on everything (no revalidation). — status: explained. Dev server only; no-store keeps tests and edits fresh. A production host should send cache headers (ETag or hashed file names).
- **SV2 low** L21–23 — no compression. — status: explained. Dev server only; a production host should compress (gzip/brotli).
