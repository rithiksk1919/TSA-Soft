"""Application service: orchestrates content, engine, evaluators, coach and storage.

Has no web code, so it can be driven by tests, the demo seeder and the server alike.
"""
from __future__ import annotations

import datetime as dt
import json

from . import content as content_mod
from .db import Database, dumps, now
from .engine import (Episode, LearnerState, Submission, apply_episode, attempt_score,
                     hint_dependency, recommend, skill_statuses, transfer_skills_for, DEFAULT_MASTERY)
from .evaluators import circuits, python_runner

MAX_ATTEMPTS = 5          # a scenario ends as "not solved" after 5 failed submissions
IDLE_CAP = 120.0          # seconds: gaps between actions longer than this count as idle
DONE = ("solved", "failed")


class ServiceError(ValueError):
    pass


def _j(text, default=None):
    return json.loads(text) if text else default


class Service:
    def __init__(self, db: Database | None = None, catalog: content_mod.Catalog | None = None):
        self.db = db or Database()
        self.cat = catalog or content_mod.load()

    # ---- profiles ---------------------------------------------------------------
    def list_profiles(self) -> list[dict]:
        return [dict(r) for r in self.db.q("SELECT id, name, is_demo, created_at FROM profiles ORDER BY is_demo DESC, name")]

    def create_profile(self, name: str, is_demo: bool = False) -> dict:
        name = (name or "").strip()
        if not 1 <= len(name) <= 40:
            raise ServiceError("Profile name must be 1-40 characters.")
        existing = self.db.one("SELECT id FROM profiles WHERE name = ?", (name,))
        if existing:
            return self.profile(existing["id"])
        pid = self.db.run("INSERT INTO profiles(name, is_demo, created_at) VALUES (?,?,?)", (name, int(is_demo), now()))
        return self.profile(pid)

    def profile(self, pid: int) -> dict:
        r = self.db.one("SELECT id, name, is_demo, created_at FROM profiles WHERE id = ?", (pid,))
        if not r:
            raise ServiceError("Unknown profile.")
        return dict(r)

    def delete_profile(self, pid: int) -> None:
        for t in ("actions", "submissions", "selection_log"):
            self.db.run(f"DELETE FROM {t} WHERE profile_id = ?", (pid,))
        self.db.run("DELETE FROM profiles WHERE id = ?", (pid,))

    # ---- learner state ----------------------------------------------------------
    def load_state(self, pid: int, domain: str, exclude_episode: int | None = None) -> LearnerState:
        skills = [s["id"] for s in self.cat.skills_in(domain)]
        st = LearnerState()
        for sk in skills:
            st.mastery[sk] = DEFAULT_MASTERY
            st.updates[sk] = 0
        for r in self.db.q("SELECT skill, mastery, updates FROM mastery WHERE profile_id = ?", (pid,)):
            if r["skill"] in st.mastery:
                st.mastery[r["skill"]] = r["mastery"]
                st.updates[r["skill"]] = r["updates"]
        rows = self.db.q("SELECT * FROM episodes WHERE profile_id = ? AND domain = ? AND status IN ('solved','failed') "
                         "AND id != ? ORDER BY ended_at, id", (pid, domain, exclude_episode or -1))
        for r in rows:
            st.episodes.append(Episode(r["scenario_id"], tuple(_j(r["skills"])), r["difficulty"], r["surface_form"],
                                       r["status"] == "solved", r["attempts"], r["hints"], tuple(_j(r["transfer_skills"], []))))
        subs = self.db.q("SELECT s.passed, s.failed_skills, e.skills FROM submissions s JOIN episodes e ON e.id = s.episode_id "
                         "WHERE s.profile_id = ? AND e.domain = ? AND e.id != ? ORDER BY s.id", (pid, domain, exclude_episode or -1))
        for r in subs:
            st.submissions.append(Submission(tuple(_j(r["skills"])), tuple(_j(r["failed_skills"])), bool(r["passed"])))
        return st

    def recommendation(self, pid: int, domain: str, only_skill: str | None = None) -> dict:
        st = self.load_state(pid, domain)
        rec = recommend(self.cat.engine_skills(domain), self.cat.engine_catalog(domain), st, only_skill).to_dict()
        rec["reasons"] = [self._readable(r) for r in rec["reasons"]]
        if rec["scenario_id"]:
            sc = self.cat.scenarios[rec["scenario_id"]]
            rec["scenario"] = {k: sc[k] for k in ("id", "title", "skills", "difficulty", "surface_form", "scaffold", "estimated_minutes")}
            rec["skill_name"] = self.cat.skill(rec["skill"])["name"]
        return rec

    def _readable(self, text: str) -> str:
        """Engine reasons use ids; show skill names and scenario titles to people."""
        for s in self.cat.skills:
            text = text.replace(f"'{s['id']}'", f"'{s['name']}'").replace(s["id"], s["name"])
        for sid, sc in self.cat.scenarios.items():
            text = text.replace(f"'{sid}'", f"'{sc['title']}'")
        return text

    # ---- diagnostic -------------------------------------------------------------
    def diagnostic_status(self, pid: int, domain: str) -> dict | None:
        r = self.db.one("SELECT * FROM diagnostics WHERE profile_id = ? AND domain = ?", (pid, domain))
        return None if not r else {"domain": domain, "answers": _j(r["answers"]), "result": _j(r["result"]), "completed_at": r["completed_at"]}

    def submit_diagnostic(self, pid: int, domain: str, answers: dict) -> dict:
        self.profile(pid)
        done = self.db.one("SELECT COUNT(*) n FROM episodes WHERE profile_id = ? AND domain = ? AND status IN ('solved','failed')", (pid, domain))["n"]
        if done:
            raise ServiceError("The diagnostic sets your starting point, so it is only available before you start practising.")
        scoring = self.cat.diagnostics["scoring"]
        result = {}
        ts = now()
        for item in self.cat.diagnostics.get(domain, []):
            choice = answers.get(item["id"])
            if choice is None:
                correct, m = None, scoring["unsure"]
            else:
                correct = int(choice) == item["answer"]
                m = scoring["correct"] if correct else scoring["incorrect"]
            result[item["skill"]] = {"correct": correct, "mastery": m, "item": item["id"]}
            self.db.run("INSERT INTO mastery(profile_id, skill, mastery, updates) VALUES (?,?,?,0) "
                        "ON CONFLICT(profile_id, skill) DO UPDATE SET mastery = excluded.mastery, updates = 0", (pid, item["skill"], m))
            self.db.run("DELETE FROM mastery_history WHERE profile_id = ? AND skill = ?", (pid, item["skill"]))
            self.db.run("INSERT INTO mastery_history(profile_id, skill, mastery, source, ts) VALUES (?,?,?,?,?)",
                        (pid, item["skill"], m, "diagnostic", ts))
        self.db.run("INSERT OR REPLACE INTO diagnostics(profile_id, domain, answers, result, completed_at) VALUES (?,?,?,?,?)",
                    (pid, domain, dumps(answers), dumps(result), ts))
        self.db.log_action(pid, None, "diagnostic", {"domain": domain, "answers": answers, "result": result}, ts)
        return {"domain": domain, "result": result, "recommendation": self.recommendation(pid, domain)}

    # ---- episodes -----------------------------------------------------------------
    def _episode_row(self, eid: int):
        r = self.db.one("SELECT * FROM episodes WHERE id = ?", (eid,))
        if not r:
            raise ServiceError("Unknown episode.")
        return r

    def active_episode(self, pid: int, domain: str | None = None):
        if domain:
            return self.db.one("SELECT * FROM episodes WHERE profile_id = ? AND domain = ? AND status = 'active' ORDER BY id DESC", (pid, domain))
        return self.db.one("SELECT * FROM episodes WHERE profile_id = ? AND status = 'active' ORDER BY id DESC", (pid,))

    def start_episode(self, pid: int, domain: str | None = None, scenario_id: str | None = None,
                      skill: str | None = None, ts: float | None = None) -> dict:
        self.profile(pid)
        if scenario_id:
            if scenario_id not in self.cat.scenarios:
                raise ServiceError("Unknown scenario.")
            domain = self.cat.scenarios[scenario_id]["domain"]
        if domain not in {d["id"] for d in self.cat.domains}:
            raise ServiceError("Unknown domain.")
        active = self.active_episode(pid, domain)
        if active and (scenario_id is None or active["scenario_id"] == scenario_id) and skill is None:
            return self.episode(active["id"])
        if active:
            self.abandon(active["id"], ts=ts)

        if scenario_id is None:
            rec = self.recommendation(pid, domain, only_skill=skill)
            if not rec["scenario_id"]:
                raise ServiceError("No scenario available right now.")
            scenario_id = rec["scenario_id"]
            selection = {k: rec[k] for k in ("skill", "priority", "target_difficulty", "mode", "worked_example",
                                             "hint_dependency", "reasons", "skills_considered")}
            selection["source"] = "engine" if skill is None else "engine-skill"
        else:
            st_rec = self.recommendation(pid, domain)
            selection = {"skill": None, "priority": None, "target_difficulty": None, "mode": "free_choice",
                         "worked_example": False, "hint_dependency": st_rec["hint_dependency"],
                         "reasons": ["You picked this scenario yourself from Challenges.",
                                     f"The engine would have recommended '{st_rec.get('scenario', {}).get('title')}' ({st_rec.get('skill_name')})."],
                         "skills_considered": st_rec["skills_considered"], "source": "learner"}
        sc = self.cat.scenarios[scenario_id]
        st = self.load_state(pid, domain)
        transfer = transfer_skills_for(self.cat.engine_scenario(sc), st.episodes)
        ts = ts or now()
        eid = self.db.run(
            "INSERT INTO episodes(profile_id, scenario_id, domain, skills, difficulty, surface_form, status, transfer_skills, "
            "selection, worked_example, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (pid, scenario_id, domain, dumps(sc["skills"]), sc["difficulty"], sc["surface_form"], "active",
             dumps(list(transfer)), dumps(selection), int(bool(selection.get("worked_example"))), ts))
        self.db.run("INSERT INTO selection_log(profile_id, domain, episode_id, scenario_id, skill, priority, target_difficulty, mode, "
                    "reasons, skills_considered, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    (pid, domain, eid, scenario_id, selection.get("skill"), selection.get("priority"),
                     selection.get("target_difficulty"), selection["mode"], dumps(selection["reasons"]),
                     dumps(selection["skills_considered"]), ts))
        self.db.log_action(pid, eid, "start", {"scenario_id": scenario_id, "mode": selection["mode"]}, ts)
        return self.episode(eid)

    def episode(self, eid: int) -> dict:
        r = self._episode_row(eid)
        sc = self.cat.scenarios[r["scenario_id"]]
        finished = r["status"] in DONE
        subs = [{"attempt_no": s["attempt_no"], "passed": bool(s["passed"]), "failed_skills": _j(s["failed_skills"]),
                 "payload": _j(s["payload"]), "result": _j(s["result"]), "ts": s["ts"]}
                for s in self.db.q("SELECT * FROM submissions WHERE episode_id = ? ORDER BY id", (eid,))]
        acts = [{"type": a["type"], "payload": _j(a["payload"]), "ts": a["ts"]}
                for a in self.db.q("SELECT type, payload, ts FROM actions WHERE episode_id = ? ORDER BY id", (eid,))]
        code = sc.get("starter")
        for a in acts:
            if a["type"] in ("edit", "run") and "code" in a["payload"]:
                code = a["payload"]["code"]
            if a["type"] == "submit" and "code" in a["payload"]:
                code = a["payload"]["code"]
        selection = _j(r["selection"])
        out = {
            "id": r["id"], "profile_id": r["profile_id"], "status": r["status"], "domain": r["domain"],
            "scenario": content_mod.public_scenario(sc),
            "domain_name": self.cat.domain(r["domain"])["name"],
            "skill_names": {s: self.cat.skill(s)["name"] for s in sc["skills"]},
            "attempts": r["attempts"], "max_attempts": MAX_ATTEMPTS, "hints_used": r["hints"],
            "hints": sc["hints"][: r["hints"]], "score": r["score"],
            "transfer_skills": _j(r["transfer_skills"], []), "selection": selection,
            "worked_example": None, "submissions": subs,
            "measurements": [a["payload"] for a in acts if a["type"] == "measure"],
            "runs": [a["payload"] for a in acts if a["type"] == "run"][-5:],
            "activity": acts[-60:], "code": code,
            "started_at": r["started_at"], "ended_at": r["ended_at"], "active_seconds": r["active_seconds"],
            "mastery_changes": _j(r["mastery_changes"]), "coach": _j(r["coach"]),
            "worked_example_viewed": any(a["type"] == "worked_example" for a in acts),
        }
        if r["worked_example"]:
            sk = selection.get("skill") or sc["skills"][0]
            out["worked_example"] = dict(self.cat.skill(sk)["worked_example"], skill=sk, skill_name=self.cat.skill(sk)["name"])
        if finished:
            out["solution"] = sc.get("solution")
            out["explanation"] = sc.get("explanation")
        return out

    def _require_active(self, eid: int):
        r = self._episode_row(eid)
        if r["status"] != "active":
            raise ServiceError("This scenario is already finished.")
        return r

    def record_action(self, eid: int, type_: str, payload: dict, ts: float | None = None) -> dict:
        r = self._require_active(eid)
        sc = self.cat.scenarios[r["scenario_id"]]
        ev = sc["evaluator"]
        if type_ == "edit":
            code = str(payload.get("code", ""))[:python_runner.MAX_CODE_CHARS]
            self.db.log_action(r["profile_id"], eid, "edit", {"code": code, "chars": len(code)}, ts)
            return {"ok": True}
        if type_ == "run":
            if ev["type"] != "python_tests":
                raise ServiceError("Run is only available for code scenarios.")
            code = str(payload.get("code", ""))
            snippet = str(payload.get("snippet", ev.get("sample", "")))[:2000]
            res = python_runner.run_snippet(code, snippet)
            self.db.log_action(r["profile_id"], eid, "run", {"code": code, "snippet": snippet, "result": res}, ts)
            return res
        if type_ == "measure":
            if ev["type"] == "python_tests":
                raise ServiceError("No multimeter here.")
            res = circuits.measure(ev, payload.get("mode"), payload.get("red"), payload.get("black"), payload.get("component"))
            self.db.log_action(r["profile_id"], eid, "measure", res, ts)
            return res
        if type_ == "worked_example":
            self.db.log_action(r["profile_id"], eid, "worked_example", {"viewed": True}, ts)
            return {"ok": True}
        raise ServiceError("Unknown action.")

    def hint(self, eid: int, ts: float | None = None) -> dict:
        r = self._require_active(eid)
        hints = self.cat.scenarios[r["scenario_id"]]["hints"]
        if r["hints"] >= len(hints):
            raise ServiceError("No more hints for this scenario.")
        n = r["hints"] + 1
        self.db.run("UPDATE episodes SET hints = ? WHERE id = ?", (n, eid))
        self.db.log_action(r["profile_id"], eid, "hint", {"hint_no": n, "text": hints[n - 1]}, ts)
        return {"hint_no": n, "text": hints[n - 1], "remaining": len(hints) - n}

    def submit(self, eid: int, payload: dict, ts: float | None = None) -> dict:
        r = self._require_active(eid)
        sc = self.cat.scenarios[r["scenario_id"]]
        ev = sc["evaluator"]
        if ev["type"] == "python_tests":
            code = str(payload.get("code", ""))
            result = python_runner.evaluate(code, ev, sc["skills"])
            stored = {"code": code}
        elif ev["type"] == "circuit_fault":
            stored = {k: payload.get(k) for k in ("component", "kind", "value")}
            if stored["kind"] not in circuits.FAULT_KINDS:
                raise ServiceError("Choose a fault type.")
            result = circuits.evaluate_fault(ev, stored, sc["skills"])
        else:
            stored = {"value": payload.get("value")}
            result = circuits.evaluate_calc(ev, stored["value"], sc["skills"])
        attempt_no = r["attempts"] + 1
        ts = ts or now()
        self.db.run("INSERT INTO submissions(episode_id, profile_id, attempt_no, passed, failed_skills, payload, result, ts) "
                    "VALUES (?,?,?,?,?,?,?,?)", (eid, r["profile_id"], attempt_no, int(result["passed"]),
                                                 dumps(result["failed_skills"]), dumps(stored), dumps(result), ts))
        self.db.run("UPDATE episodes SET attempts = ? WHERE id = ?", (attempt_no, eid))
        self.db.log_action(r["profile_id"], eid, "submit", dict(stored, attempt_no=attempt_no, passed=result["passed"],
                                                                 failed_skills=result["failed_skills"]), ts)
        out = {"result": result, "attempt_no": attempt_no, "finished": False}
        if result["passed"]:
            out.update(self._finish(eid, True, ts), finished=True)
        elif attempt_no >= MAX_ATTEMPTS:
            out.update(self._finish(eid, False, ts), finished=True)
        return out

    def give_up(self, eid: int, ts: float | None = None) -> dict:
        r = self._require_active(eid)
        self.db.log_action(r["profile_id"], eid, "give_up", {}, ts)
        return self._finish(eid, False, ts)

    def abandon(self, eid: int, ts: float | None = None) -> None:
        """Leaving for another scenario. Counts as unsolved only if real work was graded or hinted."""
        r = self._require_active(eid)
        if r["attempts"] > 0 or r["hints"] > 0:
            self.db.log_action(r["profile_id"], eid, "abandon", {"counted": True}, ts)
            self._finish(eid, False, ts)
        else:
            self.db.log_action(r["profile_id"], eid, "abandon", {"counted": False}, ts)
            self.db.run("UPDATE episodes SET status = 'abandoned', ended_at = ? WHERE id = ?", (ts or now(), eid))

    def _active_seconds(self, eid: int, end: float) -> float:
        times = [a["ts"] for a in self.db.q("SELECT ts FROM actions WHERE episode_id = ? ORDER BY ts", (eid,))] + [end]
        return round(sum(min(IDLE_CAP, max(0.0, b - a)) for a, b in zip(times, times[1:])), 1)

    def _finish(self, eid: int, solved: bool, ts: float | None = None) -> dict:
        r = self._episode_row(eid)
        pid, domain = r["profile_id"], r["domain"]
        ts = ts or now()
        st = self.load_state(pid, domain, exclude_episode=eid)
        subs = [Submission(tuple(_j(r["skills"])), tuple(_j(s["failed_skills"])), bool(s["passed"]))
                for s in self.db.q("SELECT passed, failed_skills FROM submissions WHERE episode_id = ? ORDER BY id", (eid,))]
        ep = Episode(r["scenario_id"], tuple(_j(r["skills"])), r["difficulty"], r["surface_form"], solved,
                     max(1, r["attempts"]), r["hints"], tuple(_j(r["transfer_skills"], [])))
        score = attempt_score(solved, ep.attempts, ep.hints)
        changes = apply_episode(st, ep, subs)
        for sk, (old, new) in changes.items():
            self.db.run("INSERT INTO mastery(profile_id, skill, mastery, updates) VALUES (?,?,?,?) "
                        "ON CONFLICT(profile_id, skill) DO UPDATE SET mastery = excluded.mastery, updates = excluded.updates",
                        (pid, sk, new, st.updates[sk]))
            self.db.run("INSERT INTO mastery_history(profile_id, skill, mastery, source, episode_id, ts) VALUES (?,?,?,?,?,?)",
                        (pid, sk, new, "episode", eid, ts))
        self.db.log_action(pid, eid, "complete", {"solved": solved, "score": score,
                                                  "mastery_changes": {k: [round(a, 4), round(b, 4)] for k, (a, b) in changes.items()}}, ts)
        self.db.run("UPDATE episodes SET status = ?, score = ?, ended_at = ?, active_seconds = ?, mastery_changes = ? WHERE id = ?",
                    ("solved" if solved else "failed", score, ts, self._active_seconds(eid, ts),
                     dumps({k: [round(a, 4), round(b, 4)] for k, (a, b) in changes.items()}), eid))
        mastered = {s.skill: s.mastered for s in skill_statuses(self.cat.engine_skills(domain), self.cat.engine_catalog(domain), st)}
        return {"status": "solved" if solved else "failed", "score": score,
                "mastery_changes": {k: [round(a, 4), round(b, 4)] for k, (a, b) in changes.items()},
                "newly_mastered": [k for k in changes if mastered.get(k)],
                "next": self.recommendation(pid, domain)}

    # ---- coach ------------------------------------------------------------------------
    def coach(self, eid: int, refresh: bool = False) -> dict:
        from . import coach as coach_mod
        r = self._episode_row(eid)
        if r["status"] not in DONE and not r["attempts"]:
            raise ServiceError("The coach gives feedback after you submit an attempt.")
        cached = _j(r["coach"])
        if cached and not refresh and cached.get("attempts") == r["attempts"]:
            return cached
        summary = coach_mod.build_summary(self, eid)
        fb = coach_mod.feedback(summary)
        fb["attempts"] = r["attempts"]
        self.db.run("UPDATE episodes SET coach = ? WHERE id = ?", (dumps(fb), eid))
        self.db.log_action(r["profile_id"], eid, "coach", {"source": fb["source"]})
        return fb

    # ---- dashboard -----------------------------------------------------------------------
    def scenario_statuses(self, pid: int) -> dict[str, str]:
        out = {}
        for r in self.db.q("SELECT scenario_id, status FROM episodes WHERE profile_id = ? ORDER BY id", (pid,)):
            prev = out.get(r["scenario_id"])
            if r["status"] == "abandoned":
                continue
            if prev == "solved":
                continue
            out[r["scenario_id"]] = r["status"]
        return out

    def history(self, pid: int, limit: int = 200) -> list[dict]:
        rows = self.db.q("SELECT * FROM episodes WHERE profile_id = ? AND status != 'abandoned' ORDER BY id DESC LIMIT ?", (pid, limit))
        out = []
        for r in rows:
            sc = self.cat.scenarios[r["scenario_id"]]
            sel = _j(r["selection"])
            out.append({"id": r["id"], "scenario_id": r["scenario_id"], "title": sc["title"], "domain": r["domain"],
                        "domain_name": self.cat.domain(r["domain"])["name"], "skills": _j(r["skills"]),
                        "difficulty": r["difficulty"], "status": r["status"], "attempts": r["attempts"], "hints": r["hints"],
                        "score": r["score"], "started_at": r["started_at"], "ended_at": r["ended_at"],
                        "active_seconds": r["active_seconds"], "mode": sel.get("mode"), "selection_skill": sel.get("skill"),
                        "transfer_skills": _j(r["transfer_skills"], []), "mastery_changes": _j(r["mastery_changes"]),
                        "coach": _j(r["coach"])})
        return out

    def dashboard(self, pid: int) -> dict:
        prof = self.profile(pid)
        hist = self.history(pid)
        done = [h for h in hist if h["status"] in DONE]
        statuses = self.scenario_statuses(pid)
        domains, skills_out = [], []
        for d in self.cat.domains:
            st = self.load_state(pid, d["id"])
            stats = skill_statuses(self.cat.engine_skills(d["id"]), self.cat.engine_catalog(d["id"]), st)
            flag, hinted, window = hint_dependency(st.episodes)
            for s in stats:
                sk = self.cat.skill(s.skill)
                skills_out.append({"id": s.skill, "name": sk["name"], "domain": d["id"], "mastery": s.mastery,
                                   "mastered": s.mastered, "transfer_pending": s.transfer_pending, "blocked_by": s.blocked_by,
                                   "priority": s.priority, "error_rate": s.error_rate, "available": s.available,
                                   "consecutive_failures": s.consecutive_failures, "prereqs": sk.get("prereqs", []),
                                   "episodes": sum(1 for e in st.episodes if s.skill in e.skills)})
            scen = self.cat.scenarios_in(d["id"])
            active = self.active_episode(pid, d["id"])
            domains.append({
                "id": d["id"], "name": d["name"], "short": d["short"], "description": d["description"], "icon": d["icon"],
                "avg_mastery": round(sum(s.mastery for s in stats) / len(stats), 4),
                "mastered": sum(1 for s in stats if s.mastered), "n_skills": len(stats),
                "solved": sum(1 for s in scen if statuses.get(s["id"]) == "solved"), "n_scenarios": len(scen),
                "attempted": sum(1 for s in scen if s["id"] in statuses),
                "diagnostic": self.diagnostic_status(pid, d["id"]),
                "hint_dependency": {"flagged": flag, "hinted": hinted, "window": window},
                "recommendation": self.recommendation(pid, d["id"]),
                "active_episode": active["id"] if active else None,
                "active_title": self.cat.scenarios[active["scenario_id"]]["title"] if active else None,
            })
        mistakes = []
        for s in self.db.q("SELECT s.*, e.scenario_id, e.domain FROM submissions s JOIN episodes e ON e.id = s.episode_id "
                           "WHERE s.profile_id = ? AND s.passed = 0 ORDER BY s.id DESC LIMIT 12", (pid,)):
            res = _j(s["result"])
            what = [t["name"] for t in res.get("tests", []) if not t["passed"]] or [res.get("message", "")]
            if res.get("error"):
                what = [f"{res['error']['type']}: {res['error']['message']}"]
            mistakes.append({"episode_id": s["episode_id"], "scenario_id": s["scenario_id"],
                             "title": self.cat.scenarios[s["scenario_id"]]["title"], "domain": s["domain"],
                             "attempt_no": s["attempt_no"], "failed_skills": _j(s["failed_skills"]),
                             "details": what[:3], "ts": s["ts"]})
        series: dict[str, list] = {}
        for r in self.db.q("SELECT skill, mastery, source, episode_id, ts FROM mastery_history WHERE profile_id = ? ORDER BY id", (pid,)):
            series.setdefault(r["skill"], []).append({"m": round(r["mastery"], 4), "source": r["source"], "episode_id": r["episode_id"], "ts": r["ts"]})
        today = dt.date.today()
        monday = today - dt.timedelta(days=today.weekday())
        days = {dt.date.fromtimestamp(a["ts"]) for a in self.db.q("SELECT ts FROM actions WHERE profile_id = ? AND ts >= ?",
                                                                     (pid, dt.datetime.combine(monday, dt.time()).timestamp()))}
        week = [{"day": (monday + dt.timedelta(days=i)).strftime("%a")[0], "practiced": (monday + dt.timedelta(days=i)) in days,
                 "today": (monday + dt.timedelta(days=i)) == today} for i in range(7)]
        latest = next((h for h in hist if h.get("coach")), None)
        scores = [h["score"] for h in done if h["score"] is not None]
        return {
            "profile": prof,
            "stats": {"attempted": len(done), "solved": sum(1 for h in done if h["status"] == "solved"),
                      "avg_score": round(sum(scores) / len(scores), 4) if scores else None,
                      "mastered": sum(1 for s in skills_out if s["mastered"]), "n_skills": len(skills_out),
                      "hints": sum(h["hints"] for h in done),
                      "active_minutes": round(sum(h["active_seconds"] or 0 for h in done) / 60, 1),
                      "days_this_week": sum(1 for w in week if w["practiced"])},
            "domains": domains, "skills": skills_out, "recent_mistakes": mistakes, "history": hist,
            "mastery_series": series, "week": week,
            "latest_feedback": {"episode_id": latest["id"], "title": latest["title"], "domain_name": latest["domain_name"],
                                "coach": latest["coach"], "status": latest["status"], "ts": latest["ended_at"]} if latest else None,
            "selection_log": [dict(r, reasons=_j(r["reasons"])) for r in
                              (dict(x) for x in self.db.q("SELECT id, domain, episode_id, scenario_id, skill, priority, target_difficulty, "
                                                          "mode, reasons, ts FROM selection_log WHERE profile_id = ? ORDER BY id DESC LIMIT 20", (pid,)))],
        }

    def catalog_public(self, pid: int | None = None) -> dict:
        statuses = self.scenario_statuses(pid) if pid else {}
        return {"domains": self.cat.domains,
                "skills": [{k: v for k, v in s.items()} for s in self.cat.skills],
                "scenarios": [dict({k: s[k] for k in ("id", "domain", "title", "skills", "difficulty", "surface_form",
                                                      "scaffold", "estimated_minutes", "prompt")}, status=statuses.get(s["id"], "new"))
                              for s in sorted(self.cat.scenarios.values(), key=lambda s: (s["domain"], s["id"]))]}

    def export(self, pid: int) -> dict:
        tables = {}
        for t in ("mastery", "mastery_history", "diagnostics", "episodes", "submissions", "actions", "selection_log"):
            tables[t] = [dict(r) for r in self.db.q(f"SELECT * FROM {t} WHERE profile_id = ? ORDER BY rowid", (pid,))]
        return {"profile": self.profile(pid), "exported_at": now(), "tables": tables}
