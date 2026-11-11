"""The school hub: one summary of where a learner stands.

Every number comes from the database and every choice comes from the engine.
This module only reads them and decides which room the engine's next step
belongs in.
"""
import datetime as dt

from .engine.adaptive import ERROR_WINDOW, PREREQ_THRESHOLD, REMEDIAL_FAILS, failed_transfer_check, hint_dependency
from .service import _j

TYPE_LABEL = {"python_tests": "Fix the code", "circuit_fault": "Find the fault", "circuit_calc": "Calculate and check",
              "bug_line": "Find the bug"}


def plural(count, word):
    if count == 1:
        return str(count) + " " + word
    return str(count) + " " + word + "s"


class Hub:
    def __init__(self, svc, lib, gym):
        self.svc = svc
        self.lib = lib
        self.gym = gym

    # ---- the engine's numbers for one recommendation ------------------------------------
    def decision(self, pid, domain_id, recommendation):
        svc = self.svc
        skill_id = recommendation["skill"]
        skill = svc.cat.skill(skill_id)
        considered = {}
        for row in recommendation["skills_considered"]:
            considered[row["skill"]] = row
        chosen = considered[skill_id]
        state = svc.load_state(pid, domain_id)

        recent = []
        for submission in state.submissions:
            if skill_id in submission.skills:
                recent.append(submission)
        recent = recent[-ERROR_WINDOW:]
        misses = 0
        for submission in recent:
            if skill_id in submission.failed_skills:
                misses = misses + 1

        prereq_parts = []
        for prereq_id in skill.get("prereqs", []):
            value = considered[prereq_id]["mastery"]
            if value >= PREREQ_THRESHOLD:
                verdict = "ok"
            else:
                verdict = "blocked"
            prereq_parts.append(prereq_id + " " + format(value, ".2f") + " " + verdict)
        prereq_text = "none"
        if prereq_parts:
            prereq_text = "; ".join(prereq_parts)

        flagged, hinted, window = hint_dependency(state.episodes)
        hint_text = "no"
        if flagged:
            hint_text = "yes (" + str(hinted) + " of " + str(window) + ")"

        rate_text = format(chosen["error_rate"], ".2f")
        if recent:
            rate_text = rate_text + "  (" + str(misses) + " of " + str(len(recent)) + ")"
        else:
            rate_text = rate_text + "  (no tries yet)"

        target_text = format(recommendation["target_difficulty"], ".2f")
        if recommendation["mode"] == "remedial":
            if chosen["consecutive_failures"] >= REMEDIAL_FAILS:
                target_text = target_text + "  (-0.1, " + str(chosen["consecutive_failures"]) + " fails)"
            else:
                target_text = target_text + "  (-0.1, missed transfer check)"

        table = []
        for row in recommendation["skills_considered"]:
            table.append({"name": svc.cat.skill(row["skill"])["name"], "mastery": round(row["mastery"], 3),
                          "error_rate": round(row["error_rate"], 3), "priority": round(row["priority"], 3),
                          "blocked": bool(row["blocked_by"]), "mastered": row["mastered"]})
        table.sort(key=lambda row: (row["blocked"], -row["priority"]))

        return {
            "considered": table,
            "skill": skill_id, "skill_name": skill["name"], "mastery": round(chosen["mastery"], 3),
            "error_rate": round(chosen["error_rate"], 3), "misses": misses, "tries": len(recent),
            "priority": round(chosen["priority"], 3), "recency_bonus": round(chosen["recency_bonus"], 3),
            "target": recommendation["target_difficulty"], "mode": recommendation["mode"],
            "consecutive_failures": chosen["consecutive_failures"], "hint_flag": flagged,
            "hinted": hinted, "window": window,
            "log": [["skill", skill_id], ["mastery", format(chosen["mastery"], ".2f")], ["error_rate", rate_text],
                    ["priority", format(chosen["priority"], ".2f")], ["target", target_text],
                    ["prereq", prereq_text], ["hint_dep", hint_text]],
        }

    # ---- what the learner has and has not done ------------------------------------------
    def last_failure_time(self, pid, skill_id):
        row = self.svc.db.one("SELECT MAX(s.ts) t FROM submissions s JOIN episodes e ON e.id = s.episode_id "
                              "WHERE s.profile_id = ? AND s.passed = 0 AND e.skills LIKE ?", (pid, '%"' + skill_id + '"%'))
        if row["t"] is None:
            return 0
        return row["t"]

    def lesson_viewed_since(self, pid, skill_id, since):
        rows = self.svc.db.q("SELECT payload FROM actions WHERE profile_id = ? AND type = 'lesson_viewed' AND ts > ?",
                             (pid, since))
        for row in rows:
            if _j(row["payload"], {}).get("skill") == skill_id:
                return True
        return False

    def lessons_waiting(self, pid, skill_rows):
        """Skills where the engine wants a worked example first: 2 misses in a row, or a missed transfer check,
        and the lesson has not been opened since."""
        waiting = []
        for row in skill_rows:
            needs_lesson = row["consecutive_failures"] >= REMEDIAL_FAILS
            if not needs_lesson:
                state = self.svc.load_state(pid, row["domain"])
                needs_lesson = failed_transfer_check(row["id"], state.episodes)
            if not needs_lesson:
                continue
            if self.lesson_viewed_since(pid, row["id"], self.last_failure_time(pid, row["id"])):
                continue
            waiting.append({"skill": row["id"], "name": row["name"], "domain": row["domain"]})
        return waiting

    def streak_days(self, pid):
        days = set()
        for row in self.svc.db.q("SELECT ts FROM actions WHERE profile_id = ?", (pid,)):
            days.add(dt.date.fromtimestamp(row["ts"]))
        day = dt.date.today()
        if day not in days:
            day = day - dt.timedelta(days=1)
        streak = 0
        while day in days:
            streak = streak + 1
            day = day - dt.timedelta(days=1)
        return streak

    def break_taken_since(self, pid, since):
        row = self.svc.db.one("SELECT COUNT(*) n FROM actions WHERE profile_id = ? AND type = 'break' AND ts > ?", (pid, since))
        return row["n"] > 0

    # ---- which room the next step belongs in -------------------------------------------
    def next_step(self, pid, dash, waiting, gym_ready):
        svc = self.svc
        picks = []
        for domain in dash["domains"]:
            if domain["recommendation"]["scenario_id"]:
                picks.append(domain)
        if not picks:
            return None
        # Follow the module the learner last worked in. An untouched module sits at the default
        # mastery and would otherwise always outrank it. New learners start with the first module.
        latest = {}
        position = 0
        for item in dash["history"]:
            if item["domain"] not in latest:
                latest[item["domain"]] = position
            position = position + 1
        order = {}
        position = 0
        for domain in dash["domains"]:
            order[domain["id"]] = position
            position = position + 1
        picks.sort(key=lambda domain: (latest.get(domain["id"], 999999), order[domain["id"]]))
        domain = picks[0]
        recommendation = domain["recommendation"]
        decision = self.decision(pid, domain["id"], recommendation)
        name = decision["skill_name"]
        skill_id = recommendation["skill"]

        waiting_ids = []
        for item in waiting:
            waiting_ids.append(item["skill"])
        ready_ids = []
        for item in gym_ready:
            ready_ids.append(item["skill"])
        episodes_on_skill = 0
        for row in dash["skills"]:
            if row["id"] == skill_id:
                episodes_on_skill = row["episodes"]

        step = {"domain": domain["id"], "domain_name": domain["name"], "skill": skill_id, "skill_name": name,
                "scenario": recommendation["scenario"], "mode": recommendation["mode"], "decision": decision,
                "reasons": recommendation["reasons"], "active_episode": domain["active_episode"]}

        if domain["active_episode"]:
            step.update(room="practice", action="finish what you started", button="Resume",
                        headline=name + ": finish what you started",
                        reason="You left " + domain["active_title"] + " part way through.")
        elif not domain["diagnostic"] and domain["attempted"] == 0:
            step.update(room="classroom", action="take the starting diagnostic", button="Go to the classroom",
                        headline=domain["name"] + ": take the starting diagnostic",
                        reason="One question per skill sets your starting point, so the engine does not begin from a guess.")
        elif skill_id in waiting_ids:
            if decision["consecutive_failures"] >= REMEDIAL_FAILS:
                why = "Two misses in a row"
            else:
                why = "The transfer check was missed"
            step.update(room="classroom", action="worked example first", button="Go to the classroom",
                        headline=name + ": worked example, then practice",
                        reason=why + ", so the target drops to " + format(decision["target"], ".2f") + " and a worked example comes first.")
        elif episodes_on_skill == 0 and not self.lesson_viewed_since(pid, skill_id, 0):
            step.update(room="classroom", action="learn it first", button="Go to the classroom",
                        headline=name + ": learn it, then practice",
                        reason=name + " has the highest priority (" + format(decision["priority"], ".2f") + ") and you have not met it yet, so the lesson comes first.")
        elif skill_id in ready_ids:
            step.update(room="gym", action="transfer check", button="Go to the gym",
                        headline=name + ": transfer check in the gym",
                        reason="Mastery is " + format(decision["mastery"], ".2f") + ". A never-seen problem solved with no hints confirms it.")
        else:
            if decision["tries"]:
                reason = ("Highest priority (" + format(decision["priority"], ".2f") + "): mastery " + format(decision["mastery"], ".2f") +
                          " and you missed " + str(decision["misses"]) + " of your last " + str(decision["tries"]) + " tries.")
            else:
                reason = "Highest priority (" + format(decision["priority"], ".2f") + "): mastery " + format(decision["mastery"], ".2f") + "."
            if recommendation["mode"] == "scaffolded":
                reason = reason + " Hints on " + str(decision["hinted"]) + " of your last " + str(decision["window"]) + " scenarios, so this one is more guided."
            step.update(room="practice", action="practice", button="Start practice",
                        headline=name + ": practice " + recommendation["scenario"]["title"], reason=reason)
        step["decision"]["log"].append(["action", step["action"]])
        return step

    # ---- the whole hub ---------------------------------------------------------------------
    def mastery_rows(self, dash, next_up):
        """Skills of the module in focus, one row each, plus one summary row for the other module."""
        focus = dash["domains"][0]["id"]
        if next_up:
            focus = next_up["domain"]
        lowest = None
        for row in dash["skills"]:
            if row["domain"] == focus and not row["blocked_by"]:
                if lowest is None or row["mastery"] < lowest:
                    lowest = row["mastery"]
        rows = []
        for row in dash["skills"]:
            if row["domain"] != focus:
                continue
            if next_up and row["id"] == next_up["skill"]:
                if row["mastery"] == lowest:
                    state = "Weakest. Next up."
                else:
                    state = "Next up."
                kind = "next"
            elif row["mastered"]:
                state = "Mastered. Transfer check passed."
                kind = "mastered"
            elif row["transfer_pending"]:
                state = "Proficient. Transfer check ready."
                kind = "proficient"
            elif row["blocked_by"]:
                names = []
                for prereq_id in row["blocked_by"]:
                    names.append(self.svc.cat.skill(prereq_id)["name"])
                state = "Locked until " + ", ".join(names) + " reaches 0.50."
                kind = "locked"
            elif row["episodes"] == 0:
                state = "Not started"
                kind = "new"
            else:
                state = "Developing"
                kind = "developing"
            rows.append({"skill": row["id"], "name": row["name"], "mastery": round(row["mastery"], 2),
                         "state": state, "kind": kind})
        for domain in dash["domains"]:
            if domain["id"] == focus:
                continue
            if domain["mastered"] == domain["n_skills"]:
                state = "Module B. Mastered."
            elif domain["attempted"] == 0:
                state = "Module B. Not started."
            else:
                state = "Module B. Developing."
            rows.append({"skill": domain["id"], "name": domain["name"], "mastery": round(domain["avg_mastery"], 2),
                         "state": state, "kind": "module"})
        return rows

    def summary(self, pid):
        svc = self.svc
        dash = svc.dashboard(pid)
        waiting = self.lessons_waiting(pid, dash["skills"])
        gym_ready = self.gym.ready_skills(pid)
        next_up = self.next_step(pid, dash, waiting, gym_ready)

        mistakes_due = len(self.lib.mistakes_due(pid))
        if mistakes_due:
            library_label = plural(mistakes_due, "mistake") + " due"
        else:
            library_label = "Nothing due"

        if waiting:
            classroom_label = plural(len(waiting), "worked example") + " waiting"
        elif next_up and next_up["room"] == "classroom":
            classroom_label = "Lesson ready: " + next_up["skill_name"]
        else:
            classroom_label = "Lessons for every skill"

        if gym_ready:
            names = []
            for item in gym_ready:
                names.append(item["name"].lower())
            gym_label = "Ready: " + ", ".join(names[:2])
        else:
            gym_label = "Opens at mastery 0.80"

        lunch = {"nudge": False, "hinted": 0, "window": 0, "label": "Break timer"}
        for domain in dash["domains"]:
            flag = domain["hint_dependency"]
            if flag["flagged"]:
                lunch = {"nudge": True, "hinted": flag["hinted"], "window": flag["window"],
                         "label": "Hints on " + str(flag["hinted"]) + " of last " + str(flag["window"]) + ". Take 5."}
                break

        rooms = {
            "classroom": {"label": classroom_label, "live": bool(waiting) or (next_up is not None and next_up["room"] == "classroom"),
                          "waiting": waiting},
            "library": {"label": library_label, "live": mistakes_due > 0, "mistakes_due": mistakes_due},
            "gym": {"label": gym_label, "live": bool(gym_ready), "ready": gym_ready},
            "lunch": lunch,
        }
        lunch["live"] = lunch["nudge"]

        recent = []
        for item in dash["history"][:8]:
            day = dt.date.fromtimestamp(item["ended_at"] or item["started_at"])
            recent.append({"title": item["title"], "domain": item["domain"], "status": item["status"],
                           "attempts": item["attempts"], "hints": item["hints"], "score": item["score"],
                           "mode": item["mode"], "date": day.isoformat()})
        skills_table = []
        for row in dash["skills"]:
            skills_table.append({"id": row["id"], "name": row["name"], "domain": row["domain"], "mastery": round(row["mastery"], 2),
                                 "error_rate": round(row["error_rate"], 2), "mastered": row["mastered"],
                                 "blocked": bool(row["blocked_by"]), "episodes": row["episodes"]})
        mastered = 0
        for row in dash["skills"]:
            if row["mastered"]:
                mastered = mastered + 1

        demo = self.demo_switch(pid)
        return {"profile": dash["profile"], "demo": demo, "next_up": next_up, "rooms": rooms,
                "mastery": self.mastery_rows(dash, next_up), "mistakes_due": mistakes_due,
                "streak_days": self.streak_days(pid), "counts": {"mastered": mastered, "skills": len(dash["skills"])},
                "recent": recent, "skills_table": skills_table, "selection_log": dash["selection_log"][:10]}

    def demo_switch(self, pid):
        """The two demo learners, so the top bar can switch between them in one click."""
        learners = []
        for profile in self.svc.list_profiles():
            if profile["is_demo"]:
                learners.append({"id": profile["id"], "name": profile["name"], "first": profile["name"].split()[0]})
        learners.sort(key=lambda item: item["id"])
        other = None
        for item in learners:
            if item["id"] != pid:
                other = item
                break
        return {"learners": learners, "switch_to": other}
