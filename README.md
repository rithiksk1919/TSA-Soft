# SkillBridge

Adaptive skills practice where learners practise by doing. SkillBridge records every action, keeps a mastery score for each skill, and picks the next scenario based on the learner's actual weaknesses.

- **Correctness is decided by deterministic evaluators**: a sandboxed Python test runner and an exact DC circuit solver. An AI never grades.
- **The AI coach only explains.** It receives the recorded attempts and the evaluator's verified result. Without an API key it falls back to template feedback built from the same data.
- Two modules ship with it: **Python debugging** (20 scenarios, 6 skills) and **circuit troubleshooting** (12 scenarios, 6 skills, virtual multimeter).

## Run it (one command)

```bash
python3 run.py
```

This needs only Python 3.10+ and nothing else installed. It opens http://127.0.0.1:8000. On first run it creates the two demo learners.

| Command | What it does |
|---|---|
| `python3 run.py` | Starts the app (`--port`, `--host`, `--no-browser`) |
| `python3 run.py test` | Runs the 53 unit and integration tests |
| `python3 run.py demo` | Recreates the demo learners and prints how they diverge |
| `python3 run.py simulate` | Simulates 120 synthetic learners and saves plots to `sim/output/` (needs `matplotlib`) |

Optional extras:

```bash
pip install -r requirements-optional.txt   # anthropic (AI coach) + matplotlib (simulation plots)
export ANTHROPIC_API_KEY=sk-ant-...         # enables the Claude coach; never stored in code or the database
```

Other environment variables: `SKILLBRIDGE_DB` (SQLite path, default `data/skillbridge.db`), `SKILLBRIDGE_COACH_MODEL` (default `claude-opus-5-5`), `SKILLBRIDGE_COACH_TIMEOUT` (seconds, default 30).

## Architecture

```
skillbridge/
  engine/              pure, domain-independent; no I/O, no randomness, no LLM
    learner_model.py   attempt score, expected success, mastery update
    adaptive.py        priority, prerequisites, selection, remediation, hint dependency, mastery rule
  evaluators/          deterministic graders
    python_runner.py   subprocess sandbox: timeout, empty env, no network
    sandbox_harness.py runs inside the sandbox process
    circuits.py        modified nodal analysis solver, multimeter, fault/calc grading
  content.py           loads and validates scenario JSON; strips answers for the browser
  db.py                SQLite schema (profiles, mastery, history, episodes, submissions, actions, selection log)
  service.py           orchestration used by the server, tests, demo and nothing else
  coach.py             structured summary -> Claude, or template fallback
  demo.py              seeded demo learners
  server.py            stdlib HTTP server: JSON API + static files
content/               skills.json (skills, prerequisite graph, worked examples), diagnostics.json, scenarios/*/*.json
web/                   the SkillUp-style UI: vanilla ES modules, no build step
tests/                 unittest suites
sim/simulate.py        synthetic-learner simulation and plots
```

The engine only sees skills, scenario metadata (skill tags, difficulty, surface form, scaffold level), attempts, hints and verified outcomes. It never knows whether a scenario is code or circuits.

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
| Transfer check | When `m ≥ 0.8` but mastery isn't confirmed, the engine restricts candidates to new surface forms. The Assessments page offers it directly. |
| Fallback | If every unblocked skill is out of unseen scenarios, the engine reviews: unsolved first, then least recently seen |

A scenario ends as solved, as not solved after 5 failed submissions, or when the learner gives up. Leaving one counts as not solved only if something was submitted or a hint was used.

Every pick is logged to `selection_log` with the skill, priority, target difficulty, mode, plain-language reasons and the full priority table. The lesson page shows this under "Why this scenario".

## Screens

The UI recreates the SkillUp design (sidebar, top bar, cards, monochrome). Each screen is wired as follows:

| Screen | Real data shown |
|---|---|
| Dashboard | Stats, course progress, hint dependency, recent mistakes with the skills they point to, recommended next scenario with its reason, per-skill mastery and lock status, mastery-over-time chart (with table view), practice history |
| Courses | The two domains plus 12 skill cards (prerequisites, unseen count, "Practise this skill"), recent scenarios, weekly goal from recorded activity days |
| Lessons | Scenario player: code editor with Run and hidden-test grading, or schematic with multimeter and diagnosis. Hints, results per attempt, coach, activity log, worked example in remedial mode, solution afterwards |
| Assessments | Diagnostic per domain, pending transfer checks, results table |
| Challenges | Full scenario library for free practice, logged as "your choice" alongside what the engine would have picked |
| Certification | Course certificate once every skill is mastered, per-skill progress, the mastery rule |
| Projects | Practice history cards with mastery deltas, latest coach feedback, next recommended |
| Downloads | Your data (JSON/CSV export of every table), Python starter files, simulation plots |

Blog and Music in the top bar are kept from the design but aren't part of this app.

## What's tracked

SQLite (`data/skillbridge.db`) records everything for each local profile (there's no login):
- every edit (debounced code snapshot), run (code, snippet, output), measurement, hint, worked-example view, submission (payload and the full evaluator result), give-up, abandon, completion and coach request, each timestamped
- each episode's attempts, hints, score, active time (gaps between actions capped at 2 minutes), mastery change per skill and selection reason
- mastery history per skill, for the chart

## Demo mode

`python3 run.py demo` (also in Settings and the profile picker) creates **Maya Patel** and **Leo Garcia**:
- Both give identical diagnostic answers, so the engine gives both of them *First negative number* (loops + conditionals).
- Maya twice gets the comparison wrong (`<= 0`), failing the check tagged *Conditional logic*.
- Leo twice gets the loop guard wrong (`i <= len(nums)`), crashing the checks tagged *Loop conditions*.
- Both solve it on attempt 3 with no hints, so their mastery updates are identical.
- Their next scenarios differ (Maya: *Ticket pricing*, conditionals; Leo: *Find a user's email*, loops) purely because of the different recorded mistakes.

Every step runs through the real sandbox, evaluator and engine.

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
- No secrets are in the code. The coach key is read only from `ANTHROPIC_API_KEY`.
