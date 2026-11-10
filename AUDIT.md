# UI performance and smoothness audit

Branch: `ui-perf-audit`. Scope: every UI file in the app (`static/library/`) plus the files that decide how it is loaded.

Stack: plain HTML, CSS and JavaScript with no framework, no bundler and no linter. All artwork is CSS or inline SVG (no raster images); the fonts are self-hosted woff2. "Re-render" findings below mean DOM rebuilds (`innerHTML`), because there is no virtual DOM.

Severity: **high** = can visibly drop frames or shift layout on a normal laptop; **medium** = wasted work or jank on slower devices; **low** = hygiene or a small win.

Status per finding: `fixed (<commit>)`, `explained` (left as is, with the reason) or `open`.

## Inventory

### Library room (3D home, camera and stations)
- [ ] static/library/index.html
- [ ] static/library/room.js
- [ ] static/library/room.css
- [ ] static/library/spring.js
- [ ] static/library/ui.js

### Bookshelf and book reader (Learn)
- [ ] static/library/library.js
- [ ] static/library/library.css
- [ ] static/library/interiors.js
- [ ] static/library/panel.js

### Card catalog, drawers and flashcards (Practice)
- [ ] static/library/cabinet.js
- [ ] static/library/cabinet.css
- [ ] static/library/drawers.js
- [ ] static/library/drawers.css
- [ ] static/library/review.js

### Reading desk (Apply)
- [ ] static/library/desk.js
- [ ] static/library/desk.css

### Shared state and logic
- [ ] static/library/state.js
- [ ] static/library/logic.js

### Dashboard
- [ ] static/library/dashboard.html
- [ ] static/library/dashboard.css
- [ ] static/library/dashboard.js

### Data and serving (affect load time, parsing and caching)
- [ ] static/library/data/*.json (9 files, 1–17 KB each)
- [ ] scripts/serve.mjs

## Findings

_Filled in file by file below._
