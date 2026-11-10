# UI performance and smoothness audit

Branch: `ui-perf-audit`. Scope: every UI file in the app (`static/library/`) plus the files that decide how it is loaded.

Stack: plain HTML, CSS and JavaScript with no framework, no bundler and no linter. All artwork is CSS or inline SVG (no raster images); the fonts are self-hosted woff2. "Re-render" findings below mean DOM rebuilds (`innerHTML`), because there is no virtual DOM. "Build/lint" for this project means `node --check` on every script, plus the unit and Playwright suites.

Severity: **high** = can visibly drop frames or shift layout on a normal laptop; **medium** = wasted work or jank on slower devices; **low** = hygiene or a small win.

Each finding has an ID and a status: `fixed (<commit>)`, `explained` (left as is, with the reason) or `open`.

Method: each area was read in full by a reviewer (five in parallel), and every high finding was then re-checked against the code by hand before fixing. Line numbers are from commit `76c8fad`.

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
- **IX1 high** L161 — `#room` ships with `hidden` and is only shown by room.js, the last of 12 synchronous scripts at the end of `<body>`. On a cold load the browser can paint the flat "Learn your mistakes" page before the room covers it: a flash of the wrong screen. — status: open
- **IX2 medium** L9–10 — Only Source Serif 600 and Plex Sans 400 are preloaded; the first screen also uses Plex Mono 400 and Plex Sans 500 (`font-display: swap`). Late fonts cause FOUT, and room.js re-frames the camera on `fonts.ready`, so the 3D scene can jump. — status: open
- Checked: dialogs start hidden; scripts at end of body.

### static/library/room.js (812 lines)
- **RJ1 high** L18–73, L770–776 — The room is one `preserve-3d` context of several hundred 3D-transformed faces (72 shell tiles, ~80 shelf books × 3 faces plus bands, furniture). Every camera frame (`applyCamera`, L395–409) re-projects and composites all of them; the main frame-drop risk on integrated GPUs. — status: open
- **RJ2 medium** L708–750 `safeFrame` — Interleaved writes and `getBoundingClientRect` reads (sign scaling passes, then up to 4 camera writes each followed by measuring every plaque): ~6–10 forced layouts per call; runs on boot, `fonts.ready` and every resize. — status: open
- **RJ3 medium** L679, L779 — Two unthrottled `resize` listeners; in practice state `alignCabinet()` runs twice per event, plus `safeFrame`. — status: open
- **RJ4 medium** L604–636 `alignCabinet`/`enterPractice` — ~5 forced layouts plus a root class toggle on the hand-off frame, repeated the next frame. — status: open
- **RJ5 medium** L809 — `fonts.ready → safeFrame` snaps a new `frameShift` onto the camera after fonts swap: the scene jumps. — status: open
- **RJ6 medium** L465/494, L512–518 — The away-state room uses `hidden` (`display:none`), so returning rebuilds and re-rasters hundreds of layers on the first frame of the crossfade. — status: open
- **RJ7 low** L533–537, L441–444 — `pointerover` on the world re-queries `.station3` and `.rnav__btn` on every face crossing. — status: open
- **RJ8 low** L682–686, L778 — `setInterval(tick, 1000)` runs forever, even while the room is hidden or the tab is in the background; 3 `querySelector`s per tick. — status: open
- **RJ9 low** L404–409, L416 — New pose object per camera frame; `fly.near()` adds a second rAF poll. — status: open
- Checked: all motion is transform-only via rAF springs; pointer-look is rAF-coalesced and stops when settled; `syncCatalogLabels` writes only on change.

### static/library/room.css (410 lines)
- **RC1 medium** L241–243 — `.glow3--edge`, a ~560×770 3D plane with `box-shadow: 0 0 80px 50px`, toggles `display:none ↔ block` on hover: re-raster of a large blur per station hover. — status: open
- **RC2 low** L205/219, L223/228 — `background-color`/`box-shadow` transitions on catalog drawers and plaques repaint textured 3D layers (small surfaces). — status: open
- **RC3 low** L389–390 — opacity transitions on each `.cat-deco` face; can't move to the group without flattening preserve-3d. — status: open
- Checked: no `transition: all`, no layout-property animation, the vignette is one static `::after`, reduced motion respected.

### static/library/spring.js (108 lines)
- **SP1 low** L90–98 — each `near()` caller starts its own rAF polling loop alongside the spring's loop. — status: open
- Checked: loops stop at rest, dt clamped, `jump` cancels rAF, reduced motion short-circuits.

### static/library/ui.js (137 lines)
- **UI1 low** L87–109 — focus trap measures every focusable (`getBoundingClientRect` + `getComputedStyle`) on each Tab. Keyboard-only, not during animation. — status: open
- Checked: `ui.fade` is WAAPI opacity; media listeners use `change`.

### static/library/library.js (608 lines)
- **LJ1 medium** L248–270, L436–438, L488–495 — open/close does a burst of forced style/layout (rect reads after `innerHTML`, `display` and transform writes) in the click handler before the first animation frame. — status: open
- **LJ2 medium** L444–445, L522–523 (with library.css L448) — `is-flying` stays on slot and reader for the whole time a book is open, so the infinite SVG logo animations (cover, hidden shelf spine) keep running on the main thread while reading. — status: open
- **LJ3 low** L506–510 — rAF loop polls `currentTime` until the close hand-off (~700 ms). — status: open
- **LJ4 low** L552–556 — `openBook` polls `atShelf()` every frame for up to 300 frames. — status: open
- **LJ5 low** L289–301 — dimming starts ~7 opacity animations per book. — status: open
- **LJ6 medium** L591 — fetches `data/subjects.json`, which state.js already fetches: a duplicate request and parse on every load (and `no-store` means it is never served from cache). — status: open
- Checked: parallax rAF stops when settled; `pointermove` passive; open/close is one WAAPI timeline on transform/opacity; `will-change` only during flight.

### static/library/library.css (793 lines)
- **LC1 low** L356–370 — `.contact` shadows use `filter: blur(7px)` on 3D layers (3 books). — status: open
- **LC2 low** L447–448 — the CSS half of LJ2. — status: open
- **LC3 low** L272–280 — SVG `feTurbulence` noise as background on several pseudo-elements per book. — status: open
- Checked: all motion transform/opacity; fixed scene height so no layout shift when the shelf fills.

### static/library/interiors.js (280 lines)
- **IN1 medium** L270–274 — every drawer open clears and rebuilds all interior pieces (up to ~30 3D planes, one `appendChild` each) in the same task that starts the drawer spring. — status: open
- **IN2 low** L28–35 — per-frame object and string allocation per piece, one rAF callback per piece. — status: open
- **IN3 low** L73–77, L162–166, L203–205 — staggers use `setTimeout`, not frame-aligned. — status: open
- Checked: transform/opacity only; springs re-target without stacking; data is small, no virtualization needed.

### static/library/panel.js (168 lines)
- **PN1 medium** L18–31 — the sheet (up to 800 px with a large blurred shadow) and, on phones, the full-screen scrim are animated through inline 2D transform/opacity with no `will-change`: likely repainted every frame. — status: open
- **PN2 medium** L22 — `sheet.offsetHeight` is read inside the per-frame spring callback, after other springs wrote styles: a forced style recalc every frame of the bottom-sheet slide. — status: open
- **PN3 low** L34–55 — `.pop` items animate 2D transforms on their own springs (repaints of the sheet body). — status: open
- **PN4 low** L59–61 — `drop()` picks items by window position, not the scroll body's visible area. — status: open

### static/library/cabinet.js (786 lines)
- **CJ1 medium** L35–37 — the camera writes transforms on `#track`, the wall layer (2.3× wide) and the floor layer (2.9×, holding a blurred shadow) every frame, with no promotion: likely repaints the stage every frame of the ~1.1 s move. — status: open
- **CJ2 medium** L46–47 — heading `opacity` written every camera frame, headings not promoted. — status: open
- **CJ3 medium** L303–319 — `syncBar()` → `updateCounts()` rebuilds trays `innerHTML`, rewrites 6 labels and each fan card's state text (inside composited cards) on the first frame of every card choreography, even when nothing changed. — status: open
- **CJ4 low** L496–506 — two `near()` pollers per moved card. — status: open
- **CJ5 low** L229–233, L461 — `<html>` class toggle at the start of choreographies. — status: open
- **CJ6 low** L759–767, L119–128 — resize reads/writes then re-reads; boot computes geometry twice. — status: open
- **CJ7 low** L64–65 — both scenes set `visibility: visible` on the first frame of a camera move. — status: open
- Checked: transforms only per frame; `--p` written only at rest; hover via pointerenter/leave; resize debounced.

### static/library/cabinet.css (661 lines)
- **CC1 medium** L307–311, L334 — drawer box planes (4 × 6) stay rendered while drawers are closed and hidden behind their fronts, adding 3D layers to every camera frame. The rule that hides them exists only in room practice mode (room.css L386). — status: open
- **CC2 medium** L77–86 — `.floor-shadow` `filter: blur(9px)` inside a layer that moves every camera frame (see CJ1). — status: open
- **CC3 low** L222–232 — `.cab__scrim` is a 3960×3180 3D plane kept rendered at opacity 0. — status: open
- **CC4 low** L255, L278 — `background-color` hover transitions on textured drawer faces. — status: open
- **CC5 low** L487–489 — dead `.review`/`.review__scrim` rules (overridden by drawers.css). — status: open

### static/library/drawers.js (490 lines)
- **DJ1 medium** L243–248 — `showCheck()` pops the whole `.detail`, which resets every step already shown to opacity 0 and re-animates it: visible content flashing. — status: open
- **DJ2 medium** L13–20, L85 — `live()` subscriptions outlive their panel; a later store emit can rebuild a stale flashcards view's `innerHTML` before the new view overwrites it. — status: open
- **DJ3 medium** L72–76 — with the flat Flashcards sheet open, each review answer rebuilds the sheet behind the overlay on the first frame of the card flip. — status: open
- **DJ4 medium** L91, L68, L238 — `pop(body)` animates every `.pop` node (15–25 in Index/History) with its own spring and poller. — status: open
- **DJ5 low** L376–383 — O(n²) month counting with `Intl` per row. — status: open
- **DJ6 low** L266–269 — `body.onkeydown` left on the shared body by some exits. — status: open
- Checked: data sets small (no virtualization needed); listeners bound once per render on fresh nodes.

### static/library/drawers.css (416 lines)
- **DC1 medium** L165–180 — CSS half of PN1: `.sheet` animated without `will-change`. — status: open
- **DC2 low** L156–162 — full-viewport `.sheet-scrim` opacity animated, not promoted. — status: open
- **DC3 low** L235–236 — full-viewport `.review__scrim` opacity animated, not promoted. — status: open

### static/library/review.js (201 lines)
- **RV1 medium** L120–131 — `store.answer()` emits synchronously to all subscribers (cabinet counts, flat sheet rebuild) just before the card flip starts. — status: open
- **RV2 low** L25–27 — FLIP measure forces a layout once per open/exit. — status: open
- **RV3 low** L17–23 — fly card not explicitly promoted while it scales. — status: open
- Checked: one keydown listener; transform/opacity only; reduced-motion fallback.

### static/library/desk.js (681 lines)
- **DK1 medium** L57–84, L629–630 — `open()` calls `fit()` before `start()` renders the paper, so stage height and the wall/floor split are measured on an empty desk and stay wrong until a resize, which then jumps. — status: open
- **DK2 medium** L287–298, L253 — streaming text: `textContent` + `scrollHeight` read + `scrollTop` write every 16 ms on a `scroll-behavior: smooth` log, restarting the smooth scroll each tick (stuttering scroll). — status: open
- **DK3 medium** L50–54 — `pointermove` reads `getBoundingClientRect` per event and each `yaw.to()` pushes a new promise into the spring's waiting list until it rests. — status: open
- **DK4 medium** L41–48, L87–90 — the tutor ResizeObserver writes `--dock-h` and runs `fit()` (forced layouts, root custom-property writes) on every streamed line, even when unchanged. — status: open
- **DK5 low** L47–48, L103–104 — two springs paint the same element twice per frame. — status: open
- **DK6 low** L107–128 — `point()` measures offsets right after DOM writes on each message. — status: open
- **DK7 low** L359, L395 — `scrollIntoView({smooth})` concurrent with other animations. — status: open
- **DK8 low** L605–614 — `desk.json` loads on first open with no loading state; a failed load is cached forever. — status: open
- Checked: springs stop at rest; motion is transform/opacity; handlers reassigned not stacked; localStorage written once per scenario.

### static/library/desk.css (483 lines)
- **DS1 medium** L225–231 — `.dk-spot` is a 2200×2200 `will-change` layer (≈60–80 MB texture at DPR 2) composited every frame the spot moves. — status: open
- **DS2 low** L151–157, L172–175 — `filter: blur()` on large 3D layers. — status: open
- **DS3 low** L167 — `filter: brightness()` per book face. — status: open
- **DS4 low** L244/246, L322/326 — `box-shadow` transitions on paper/card. — status: open
- **DS5 low** L260 — color/opacity transitions on SVG groups. — status: open
- **DS6 low** L397 — `scroll-behavior: smooth` on the log (CSS half of DK2). — status: open

### static/library/state.js (180 lines)
- **ST1 medium** L155–157 — boot fetches 7 JSON files; `subjects.json` is fetched again by library.js (LJ6). — status: open
- **ST2 low** L45–61, L95 — `store.cards()` rebuilds every card object on each count/label refresh. — status: open
- **ST3 low** L167–168 — `indexOf` in `forEach` (O(n²)). — status: open
- Checked: localStorage written only on discrete actions.

### static/library/logic.js (182 lines)
- **LG1 low** L69–78 — `stepSpring` allocates a result object per spring per frame. — status: open
- Checked: no DOM, timers or loops; sort copies first and is not per-frame.

### static/library/dashboard.html (161 lines)
- **DH1 high** L76–137 — every data region starts empty and fills after `fetch()` resolves: the hero stats, chart (0 → 276 px), tables and due list all push content down at once (layout shift). — status: open
- **DH2 low** L75 — "Welcome back" is replaced by a longer greeting, which can wrap. — status: open
- **DH3 medium** L9–10 — Source Serif 600 (hero title, stat numbers) is not preloaded; FOUT on the largest above-the-fold text. — status: open
- **DH4 low** L159 — data request starts only after the script at the end of body runs. — status: open

### static/library/dashboard.css (569 lines)
- **DC-1 high** L327–328 etc. — CSS half of DH1: no reserved space for the chart, stats, tables or due list. — status: open
- **DC-2 medium** L371, L377–380 — `.due__link` animates a blurred `box-shadow` with `translateZ` on hover. — status: open
- **DC-3 medium** L203–204 — every cuboid renders all 6 faces, including faces never visible (bottoms, backs): ~80 3D layers. — status: open
- **DC-4 low** L232 — `filter: brightness()` on book back faces. — status: open
- **DC-5 low** L421–425 — `--rx/--ry` set on `.diorama`, invalidating the whole subtree each pointermove; no `will-change` on `.world`. — status: open
- **DC-6 low** L217–222 — `.book3d__link` animates transform without `will-change`. — status: open

### static/library/dashboard.js (373 lines)
- **DJS1 medium** L363–368 — `pointermove` reads `getBoundingClientRect` per event right after the previous style write; not rAF-coalesced. — status: open
- **DJS2 medium** L111–118, L343–359 — first render interleaves writes and reads (two forced layouts) and the chart is drawn twice (sync, then the ResizeObserver's first callback). — status: open
- **DJS3 medium** L348–351, L166–184 — the chart is rebuilt with `innerHTML` on every 1 px of resize, re-binding 8 listeners each time. — status: open
- **DJS4 low** L177–180 — tooltip measures `offsetWidth` after unhiding. — status: open
- **DJS5 low** L311 — search not debounced (fine at 11 rows). — status: open

### static/library/data/*.json (59 KB in 9 files)
- **DA1 medium** subjects.json fetched twice (same as LJ6/ST1). — status: open
- **DA2 low** desk.json loaded lazily with no loading state (same as DK8). — status: open
- **DA3 low** author-only `_note`/`_derivation` fields shipped (~2–3 KB). — status: open

### scripts/serve.mjs (28 lines)
- **SV1 low** L22 — `cache-control: no-store` on everything (no revalidation). — status: open
- **SV2 low** L21–23 — no compression. — status: open
