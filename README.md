# SkillBridge

An adaptive practice engine, demonstrated in two skill areas: **Python debugging** (20 scenarios, 6 skills) and **circuit troubleshooting** (12 scenarios, 6 skills). It records every action, keeps a mastery score per skill, and picks the next step from the learner's actual mistakes.

- **Correctness is decided by deterministic evaluators**: a sandboxed Python test runner, an exact DC circuit solver, and a fixed answer key for the Gym. Nothing else grades.
- **The coach only explains.** It is a template coach built from the recorded data (attempts, hints, the evaluator's verified result). It sits behind one function, `get_feedback(actions, result, context)` in `skillbridge/coach.py`, so a real AI model can replace it later without touching anything else. No API key, no network.
- **Runs locally with one command.** No accounts (local profile names only), no Wi-Fi, SQLite storage, bundled fonts.

## Run it

```bash
python3 run.py
```

Python 3.10+ and nothing else. It opens http://127.0.0.1:8000, the school hub. The first run creates the two demo learners.

| Command | What it does |
|---|---|
| `python3 run.py` | Starts the app (`--port`, `--host`, `--no-browser`) |
| `python3 run.py test` | Runs the Python unit and integration tests |
| `python3 run.py demo` | Recreates the demo learners and prints how they diverge |
| `python3 run.py simulate` | Simulates synthetic learners and saves plots to `sim/output/` (needs `matplotlib`, see `requirements-optional.txt`) |
| `npm run test:unit` | The library's front-end logic tests (Node only, optional) |

## The school hub

The home screen is a cutaway school with four rooms. It doubles as the dashboard: everything on it is read from the database, and the next step comes from the engine.

- **Next up, chosen by the engine**: the skill and action, one reason sentence, a button that goes to the right room, and **Why this?** (mastery, error rate, the priority formula with its numbers, target difficulty, every skill considered, and the logged reasons).
- **Skill mastery**: one row per skill with its value, a bar and a text state (Weakest. Next up. / Developing / Proficient. Transfer check ready. / Locked until ... / Mastered), plus one row for the other module.
- **Why this pick**: the engine's decision log (skill, mastery, error_rate, priority, target, prereq, hint_dep, action).
- **Mistakes due and study streak.**
- **Classic view**: the same data as plain tables (skills, rooms, recent attempts with their score o, and the selection log).
- **Demo learner: Priya. Switch to Marcus**: one click switches learners.

| Room | Purpose | Live badge |
|---|---|---|
| Classroom (LEARN) | Learn a skill the first time: chalkboard (code traced step by step with global and local memory, the error step marked), textbook (two-page spread with a nested-box diagram and key term), listening desk (the browser reads the transcript aloud when speech is available). Also the starting diagnostic. The engine sends a learner here for a new skill, after two misses in a row, and after a missed transfer check | "1 worked example waiting" |
| Library (REVIEW MISTAKES) | Mistakes index, flashcards, reading desk, card catalog, history | "3 mistakes due" |
| Gym (TRANSFER CHECK) | Bug Hoops (below) | "Ready: loop conditions" |
| Lunchroom (BREAK) | A 5-minute break timer, suggested when the engine flags hint dependency (hints on more than half of the last 5 scenarios). Breaks never change mastery; while the flag is on the engine prefers more scaffolded scenarios | "Hints on 3 of last 5. Take 5." |

### Bug Hoops (the Gym)

Three rounds. Each round is a transfer scenario the learner has never seen, with new names and a new story; each line of the snippet is a button, and clicking the line with the bug takes the shot. Hints are locked (the server refuses them). The shot is graded on the server by the `bug_line` evaluator against a hidden answer key, and every shot is logged.

The game is one engine episode: 2 of 3 with no hints solves it, with `attempts = misses + 1`, so the outcome formula applies as usual. Because its rounds are never-seen scenarios in new surface forms, a solved game is the transfer item the mastery rule needs. A missed game sends the skill back to practice with a worked example. Replaying problems already seen is allowed but does not count as a fresh transfer check.

There are 3 transfer scenarios per skill (36) in `content/transfer/`. Practice never uses them.

### Lessons are data

`content/lessons/<skill_id>.json` holds each lesson (chalkboard code and steps with memory, textbook pages, transcript). The six Python skills have hand-written lessons. A skill without a file gets a lesson built from its worked example in `content/skills.json`, so adding a skill adds its lesson.

## The library

The library (`/library/`) is the original 3D room, reading desk, card catalog and mistakes index, unchanged except: its back button now says "Back to hub", its data files are generated live from SQLite (Python and circuits content), and the card catalog labels are larger. See `skillbridge/library.py`.

## Learner model and engine

| Rule | Implementation |
|---|---|
| Attempt score | solved: `o = max(0.4, 1 - 0.2(attempts-1) - 0.15 hints)`; not solved: `o = 0` |
| Expected success | `p = 1 / (1 + exp(-6 (m - d)))` |
| Update | `m = clamp(m + α(o - p), 0, 1)`; `α = 0.25` for a skill's first 3 updates, then `0.12`; every tagged skill is updated |
| Start | 0.3, or from the diagnostic (correct 0.5, incorrect 0.2, not sure 0.3) |
| Priority | `(1 - m) + 0.3 × error rate over the last 5 graded attempts on the skill + recency bonus` (0.02 per episode since last practised, max 0.10) |
| Prerequisites | A skill is skipped while any prerequisite is below 0.5. The graph is in `content/skills.json`, e.g. conditionals → loops → off-by-one; returns → scope; Ohm's law → series → parallel/open/short |
| Selection | Unseen scenario in the top-priority skill with difficulty closest to `m + 0.1` (ties broken by id) |
| Remediation | 2 failures in a row on a skill lower the target by 0.1 and show that skill's worked example first |
| Hint dependency | Hints on more than half of the last 5 scenarios (3+) prefer the most scaffolded candidate |
| Mastered | `m ≥ 0.8`, the last two distinct scenarios near that difficulty (`d ≥ m − 0.4`) were solved, and one of them was a transfer item (never seen, surface form not previously practised for that skill) solved with no hints |
| Transfer check | When `m ≥ 0.8` but mastery isn't confirmed, the Gym opens for that skill (Bug Hoops, below). A missed transfer check sends the skill back to practice: target lowered by 0.1 and a worked example first |
| Fallback | If every unblocked skill is out of unseen scenarios, the engine reviews: unsolved first, then least recently seen |

A scenario ends as solved, as not solved after 5 failed submissions, or when the learner gives up. Leaving one counts as not solved only if something was submitted or a hint was used.

Every pick is logged to `selection_log` with the skill, priority, target difficulty, mode, plain-language reasons and the full priority table. The lesson page shows this under "Why this scenario".

## Scenario format

Each scenario is one JSON file in `content/scenarios/<domain>/`:

```jsonc
{
  "id": "py-loop-02", "domain": "python", "title": "First negative number",
  "skills": ["py_loops", "py_conditionals"],   // every tagged skill is updated
  "difficulty": 0.45,                           // 0..1
  "surface_form": "list-search",                // used for transfer checks
  "scaffold": 1,                                // 0 none, 1 some visible tests, 2 guided
  "prompt": "...", "starter": "def first_negative(nums): ...",
  "hints": ["nudge", "stronger", "near-answer"],  // ordered
  "explanation": "author's verified description of the bug (given to the coach)",
  "evaluator": { "type": "python_tests", "entry": "first_negative", "sample": "print(...)",
                 "tests": [{ "name": "empty list returns -1", "args": [[]], "expected": -1,
                             "skills": ["py_loops"], "visible": true }] },
  "solution": "..."                             // hidden until the scenario ends
}
```

Circuit scenarios use `"evaluator": {"type": "circuit_fault" | "circuit_calc", "circuit": {nodes, ground, components}, "meter": [...], "fault": {...} | "question": {...}}`.

Each test (or each part of a diagnosis) is tagged with the skill it exercises. A failed submission records **which skills its failing checks point to**, so two learners who fail the same scenario in different ways leave different evidence.

The tests check the content itself. Every Python starter must fail and every reference solution must pass. Every circuit fault must be observable with the meters that bench allows. Every calculation answer must match the solver.

## Project layout

```
skillbridge/
  engine/              pure, domain-independent; no I/O, no randomness, no AI
    learner_model.py   attempt score, expected success, mastery update
    adaptive.py        priority, prerequisites, selection, remediation, hint dependency, mastery rule
  evaluators/          deterministic graders: python_runner.py (sandbox), circuits.py (solver), bug_line.py (Gym)
  content.py           loads and validates scenarios; strips answers for the browser
  db.py                SQLite schema
  service.py           practice episodes, diagnostic, history, dashboard data
  gym.py               Bug Hoops: transfer-check games
  hub.py               the hub summary: next step and its room, decision log, badges
  lessons.py           classroom lessons
  library.py           the library's data files, live from SQLite
  coach.py             get_feedback(actions, result, context): the template coach
  demo.py              the two demo learners
  server.py            stdlib HTTP server: JSON API + static files
content/               skills, diagnostics, scenarios, transfer scenarios, lessons, library mistakes
static/hub/            the school: hub, classroom, gym, lunchroom, classic view (no build step)
static/library/        the library
web/                   the practice screens (code editor, circuit bench), served at /practice/
tests/                 Python tests; tests/unit has the library's Node tests
```

## Demo mode

`python3 run.py demo` (also the first run) creates **Priya Nair** and **Marcus Reed**. Both give the same diagnostic answers, so the engine gives both *First negative number*. Priya twice gets the comparison wrong (`<= 0`), failing the check tagged Conditional logic. Marcus twice gets the loop guard wrong (`i <= len(nums)`), crashing the checks tagged Loop conditions. Both solve it on attempt 3 with no hints, so their mastery updates are identical. Their next steps differ (Priya: Conditional logic, *Ticket pricing*; Marcus: Loop conditions, *Find a user's email*) only because of the different recorded mistakes. On the hub, the "Switch to Marcus" button shows this in one click.

## Simulation results

`python3 run.py simulate` runs 120 synthetic learners per domain. Each has hidden true skill levels, a weakness profile, a hint-use tendency and learns slowly as they practise. Success is drawn from the hidden level, so the engine sees only attempts, hints and failing checks. With seed 7, 30 scenarios each:

| | Python | Circuits |
|---|---|---|
| Correlation of final estimate with true skill | r = 0.82 | r = 0.53 |
| Mean abs. error, after diagnostic → after practice | 0.195 → 0.111 | 0.222 → 0.114 |
| Learner pairs from different weakness groups with identical first-8 skill sequences | 0% | 0% |

In every weakness group, the engine's most-targeted skill is that group's weak skill (`sim/output/skill_choice_by_weakness.png`).

Known limitations:
- The engine **overestimates the weakest learners**: a solve scores at least 0.4, and learners improve during the run.
- Circuits tracks less tightly than Python: it has only 12 scenarios, most tagged with 2–3 skills, so evidence is spread thin.
- Adding scenarios is the most direct fix for both.

## Security notes

- The server binds to 127.0.0.1. Profiles are names with no passwords, intended for one computer.
- Learner code runs in a separate `python -I -S` process with an empty environment, a fresh temp directory and a 10 s process timeout, plus a 1 s alarm per test. Inside it:
  - CPU, memory and file-size limits apply
  - an audit hook blocks sockets, subprocesses, file writes and ctypes
  - on macOS, `sandbox-exec` also denies all network and writes outside the temp directory; on Linux, `unshare -rn` is used when available
- This is suitable for a local practice app, not as a hardened multi-tenant sandbox.
- No secrets and no API keys are used anywhere.
