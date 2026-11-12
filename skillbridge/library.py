"""The library's data files, built live from SQLite.

The library screens read data/cards.json, data/history.json and so on. The
server answers those requests from here, in exactly the same JSON shapes, so
the library itself does not change. Only the content does: Python debugging and
circuit troubleshooting instead of the old sample subjects.

Authored content: content/library/mistakes.json (mistakes and flashcards) and
the worked examples in content/skills.json. Per learner: how often each mistake
was made, when it was last seen, mastery, past attempts and Leitner boxes.
"""
import datetime as dt
import json
from pathlib import Path

from .db import now
from .engine import skill_statuses
from .service import _j

LEARNED = 3
CONTENT_FILE = Path(__file__).resolve().parent.parent / "content" / "library" / "mistakes.json"
CALL_PREFIX = {"python": "PY", "circuits": "CK"}
SUBJECT_STYLE = {
    "python": {"accent": "#2D4A6E", "logo": "flask"},
    "circuits": {"accent": "#7B3F36", "logo": "atom"},
}
TYPE_LABEL = {"python_tests": "Fix the code", "circuit_fault": "Find the fault", "circuit_calc": "Calculate and check"}


def initials(name):
    letters = ""
    for part in name.split()[:2]:
        letters = letters + part[0].upper()
    if not letters:
        return "?"
    return letters


def days_ago(timestamp):
    seen = dt.date.fromtimestamp(timestamp)
    return max(0, (dt.date.today() - seen).days)


class Library:
    def __init__(self, svc):
        self.svc = svc
        self.content = json.loads(CONTENT_FILE.read_text())

    # ---- per-learner facts -----------------------------------------------------------
    def mistake_stats(self, pid):
        """skill id -> {"count": failed submissions that point at it, "last": newest timestamp}."""
        stats = {}
        rows = self.svc.db.q("SELECT failed_skills, ts FROM submissions WHERE profile_id = ? AND passed = 0", (pid,))
        for row in rows:
            for skill_id in _j(row["failed_skills"], []):
                if skill_id not in stats:
                    stats[skill_id] = {"count": 0, "last": 0.0}
                stats[skill_id]["count"] = stats[skill_id]["count"] + 1
                if row["ts"] > stats[skill_id]["last"]:
                    stats[skill_id]["last"] = row["ts"]
        return stats

    def made_mistakes(self, pid):
        """The authored mistakes this learner has actually made."""
        stats = self.mistake_stats(pid)
        made = []
        for mistake in self.content["mistakes"]:
            if mistake["skill"] in stats:
                made.append(mistake)
        return made

    def boxes(self, pid):
        boxes = {}
        rows = self.svc.db.q("SELECT card_id, box FROM card_boxes WHERE profile_id = ?", (pid,))
        for row in rows:
            boxes[row["card_id"]] = row["box"]
        return boxes

    def set_box(self, pid, card_id, box):
        known = False
        for mistake in self.content["mistakes"]:
            for card in mistake["cards"]:
                if card["id"] == card_id:
                    known = True
        if not known:
            raise ValueError("Unknown card.")
        box = max(1, min(LEARNED, int(box)))
        self.svc.db.run("INSERT INTO card_boxes(profile_id, card_id, box, updated_at) VALUES (?,?,?,?) "
                        "ON CONFLICT(profile_id, card_id) DO UPDATE SET box = excluded.box, updated_at = excluded.updated_at",
                        (pid, card_id, box, now()))
        self.svc.db.log_action(pid, None, "card", {"card": card_id, "box": box})
        return {"card": card_id, "box": box}

    def mistakes_due(self, pid):
        """Mistakes this learner made that still have at least one card not learned."""
        boxes = self.boxes(pid)
        due = []
        for mistake in self.made_mistakes(pid):
            for card in mistake["cards"]:
                if boxes.get(card["id"], 1) < LEARNED:
                    due.append(mistake)
                    break
        return due

    def cards_due(self, pid):
        boxes = self.boxes(pid)
        count = 0
        for mistake in self.made_mistakes(pid):
            for card in mistake["cards"]:
                if boxes.get(card["id"], 1) < LEARNED:
                    count = count + 1
        return count

    # ---- the JSON files ---------------------------------------------------------------
    def subjects(self):
        out = []
        for domain in self.svc.cat.domains:
            style = SUBJECT_STYLE[domain["id"]]
            out.append({"id": domain["id"], "name": domain["name"], "accent": style["accent"]})
        return out

    def cards_json(self, pid):
        if pid:
            mistakes = self.made_mistakes(pid)
        else:
            mistakes = self.content["mistakes"]
        out = []
        for mistake in mistakes:
            skill = self.svc.cat.skill(mistake["skill"])
            out.append({"id": mistake["id"], "subject": skill["domain"], "call": mistake["call"],
                        "title": mistake["title"], "skill": skill["name"], "cards": mistake["cards"]})
        return {"subjects": self.subjects(), "mistakes": out}

    def mistakes_json(self, pid):
        stats = {}
        if pid:
            stats = self.mistake_stats(pid)
        out = {}
        for mistake in self.content["mistakes"]:
            count = 0
            last_seen = 0
            if mistake["skill"] in stats:
                count = stats[mistake["skill"]]["count"]
                last_seen = days_ago(stats[mistake["skill"]]["last"])
            out[mistake["id"]] = {"callNumber": mistake["call"], "timesMade": count, "lastSeenDays": last_seen,
                                  "explanation": mistake["explanation"], "wrongExample": mistake["wrongExample"],
                                  "rightExample": mistake["rightExample"]}
        return {"mistakes": out}

    def worked_json(self):
        examples = []
        number = 0
        for mistake in self.content["mistakes"]:
            number = number + 1
            skill = self.svc.cat.skill(mistake["skill"])
            worked = skill["worked_example"]
            steps = []
            for text in worked["steps"]:
                steps.append({"text": text, "explain": ""})
            steps[0]["explain"] = "Start from what the problem gives you."
            steps[-1]["explain"] = "Check the fix against a small case."
            steps[-1]["mistake"] = True
            steps[-1]["watch"] = mistake["explanation"]
            card = mistake["cards"][0]
            if skill["domain"] == "python":
                problem = worked["before"].replace("\n", "  ")
            else:
                problem = skill["description"]
            examples.append({"id": "we-" + mistake["id"][2:], "mistake": mistake["id"],
                             "call": "WE." + CALL_PREFIX[skill["domain"]] + "." + str(number).zfill(3),
                             "title": worked["title"], "problem": problem, "steps": steps,
                             "check": {"question": card["prompt"], "options": card["options"],
                                       "answer": card["answer"], "explain": card["explain"]}})
        return {"examples": examples}

    def diagnostic_json(self):
        questions = []
        for domain in self.svc.cat.domains:
            for item in self.svc.cat.diagnostics.get(domain["id"], []):
                prompt = item["question"]
                if item.get("code"):
                    prompt = prompt + " " + item["code"].replace("\n", "  ")
                questions.append({"id": item["id"], "subject": domain["id"],
                                  "skill": self.svc.cat.skill(item["skill"])["name"], "difficulty": 0.4,
                                  "prompt": prompt, "options": item["options"], "answer": item["answer"],
                                  "explain": item.get("explain", "")})
        return {"questions": questions}

    def history_json(self, pid):
        attempts = []
        if not pid:
            return {"attempts": attempts}
        for item in self.svc.history(pid, 40):
            if item["status"] not in ("solved", "failed"):
                continue
            started = item["started_at"]
            timeline = []
            rows = self.svc.db.q("SELECT type, payload, ts FROM actions WHERE episode_id = ? "
                                 "AND type IN ('run', 'hint', 'submit', 'measure', 'shot') ORDER BY id", (item["id"],))
            for row in rows:
                payload = _j(row["payload"], {})
                seconds = int(row["ts"] - started)
                clock = str(seconds // 60).zfill(2) + ":" + str(seconds % 60).zfill(2)
                if row["type"] == "hint":
                    timeline.append([clock, "hint", payload.get("text", "Hint")])
                elif row["type"] == "submit":
                    if payload.get("passed"):
                        timeline.append([clock, "submit", "Solved"])
                    else:
                        timeline.append([clock, "submit", "Check failed"])
                elif row["type"] == "shot":
                    if payload.get("made"):
                        timeline.append([clock, "submit", "Shot made"])
                    else:
                        timeline.append([clock, "submit", "Shot missed"])
                elif row["type"] == "run":
                    timeline.append([clock, "run", "Ran the code"])
                else:
                    timeline.append([clock, "run", "Probed the circuit"])
            if not timeline:
                timeline.append(["00:00", "submit", "Finished"])
            day = dt.date.fromtimestamp(started)
            attempts.append({"id": "att-" + str(item["id"]),
                             "call": "AT." + day.strftime("%m%d") + "." + CALL_PREFIX[item["domain"]],
                             "date": day.isoformat(), "subject": item["domain"],
                             "skill": self.svc.cat.skill(item["skills"][0])["name"], "title": item["title"],
                             "solved": item["status"] == "solved", "attempts": max(1, item["attempts"]),
                             "hints": item["hints"], "actions": timeline[:12]})
        return {"attempts": attempts}

    def subjects_json(self, pid, hub):
        learner = {"name": "Guest", "initials": "?"}
        if pid:
            name = self.svc.profile(pid)["name"]
            learner = {"name": name, "initials": initials(name)}
        subjects = []
        for domain in self.svc.cat.domains:
            style = SUBJECT_STYLE[domain["id"]]
            mastery = {}
            mastered = {}
            next_problem = None
            chosen_skill = None
            if pid:
                state = self.svc.load_state(pid, domain["id"])
                statuses = skill_statuses(self.svc.cat.engine_skills(domain["id"]),
                                          self.svc.cat.engine_catalog(domain["id"]), state)
                for status in statuses:
                    mastery[status.skill] = status.mastery
                    mastered[status.skill] = status.mastered
                recommendation = self.svc.recommendation(pid, domain["id"])
                if recommendation["scenario_id"]:
                    chosen_skill = recommendation["skill"]
                    next_problem = self.next_problem(pid, domain["id"], recommendation, hub)
            skills = []
            for skill in self.svc.cat.skills_in(domain["id"]):
                row = {"name": skill["name"], "mastery": round(mastery.get(skill["id"], 0.3), 2)}
                if skill["id"] == chosen_skill:
                    row["note"] = "Next up"
                if mastered.get(skill["id"]):
                    row["mastered"] = True
                skills.append(row)
            subjects.append({"id": domain["id"], "name": domain["name"], "accent": style["accent"],
                             "logo": style["logo"], "book": {"width": 84, "height": 214},
                             "skills": skills, "next": next_problem})
        return {"learner": learner, "subjects": subjects}

    def next_problem(self, pid, domain_id, recommendation, hub):
        scenario = self.svc.cat.scenarios[recommendation["scenario_id"]]
        decision = hub.decision(pid, domain_id, recommendation)
        titles = []
        for mistake in self.content["mistakes"]:
            if mistake["skill"] == recommendation["skill"]:
                titles.append(mistake["title"])
        return {"id": scenario["id"], "title": scenario["title"], "skill": decision["skill_name"],
                "type": TYPE_LABEL[scenario["evaluator"]["type"]], "mastery": decision["mastery"],
                "difficulty": scenario["difficulty"], "why": recommendation["reasons"][0],
                "log": decision["log"], "mistakes": titles}

    def review_json(self, pid):
        if not pid:
            return {"v": 1, "boxes": {}}
        return {"v": 1, "boxes": self.boxes(pid)}

    def dashboard_json(self, pid, hub):
        """The library's dashboard page (dashboard.html), filled from the same hub summary."""
        name = "Guest"
        if pid:
            name = self.svc.profile(pid)["name"]
        first_name = name.split()[0]
        data = {"learner": {"name": name, "firstName": first_name, "initials": initials(name)},
                "today": dt.date.today().isoformat(), "nextUp": None, "subjects": [],
                "stats": [], "repeatRisk": [], "trend": {"weeks": [], "series": {}}, "due": [], "log": []}
        for subject in self.subjects():
            data["subjects"].append({"id": subject["id"], "name": subject["name"], "color": subject["accent"],
                                     "code": CALL_PREFIX[subject["id"]]})
            data["trend"]["series"][subject["id"]] = []
            data["due"].append({"subject": subject["id"], "count": 0, "overdue": 0})
        if not pid:
            return data
        summary = hub.summary(pid)
        if summary["next_up"]:
            data["nextUp"] = {"title": summary["next_up"]["scenario"]["title"], "skill": summary["next_up"]["skill_name"],
                              "subjectName": summary["next_up"]["domain_name"]}
        data["stats"] = [
            {"id": "caught", "label": "Mistakes made", "period": "all time", "value": len(self.made_mistakes(pid)),
             "delta": 0, "deltaLabel": "different kinds", "goodWhen": "down"},
            {"id": "mastered", "label": "Skills mastered", "period": "all time", "value": summary["counts"]["mastered"],
             "delta": 0, "deltaLabel": "of " + str(summary["counts"]["skills"]) + " skills", "goodWhen": "up"},
            {"id": "due", "label": "Flashcards due", "period": "today", "value": self.cards_due(pid),
             "delta": 0, "deltaLabel": "from your missed checks", "goodWhen": "none"},
            {"id": "streak", "label": "Practice streak", "period": "days", "value": summary["streak_days"],
             "delta": 0, "deltaLabel": "days in a row", "goodWhen": "up", "unit": "days"},
        ]
        stats = self.mistake_stats(pid)
        for mistake in self.made_mistakes(pid):
            count = stats[mistake["skill"]]["count"]
            risk = "low"
            if count >= 3:
                risk = "high"
            elif count == 2:
                risk = "medium"
            data["repeatRisk"].append({"id": mistake["id"], "subject": self.svc.cat.skill(mistake["skill"])["domain"],
                                       "callNumber": mistake["call"], "pattern": mistake["title"],
                                       "detail": mistake["explanation"].split(". ")[0] + ".", "times": count,
                                       "lastSeen": dt.date.fromtimestamp(stats[mistake["skill"]]["last"]).isoformat(),
                                       "sources": ["Practice"], "risk": risk})
        today = dt.date.today()
        week_start = today - dt.timedelta(days=today.weekday())
        weeks = []
        for back in (3, 2, 1, 0):
            weeks.append(week_start - dt.timedelta(days=7 * back))
        for week in weeks:
            data["trend"]["weeks"].append(week.strftime("%b") + " " + str(week.day))
        rows = self.svc.db.q("SELECT s.ts, e.domain FROM submissions s JOIN episodes e ON e.id = s.episode_id "
                             "WHERE s.profile_id = ? AND s.passed = 0", (pid,))
        for subject in self.subjects():
            for week in weeks:
                count = 0
                for row in rows:
                    day = dt.date.fromtimestamp(row["ts"])
                    if row["domain"] == subject["id"] and week <= day < week + dt.timedelta(days=7):
                        count = count + 1
                data["trend"]["series"][subject["id"]].append(count)
        for item in summary["recent"]:
            result = "Not solved"
            if item["status"] == "solved":
                result = "Solved on attempt " + str(item["attempts"])
            data["log"].append({"date": item["date"], "kind": "session", "subject": item["domain"],
                                "title": item["title"], "result": result})
        return data

    def file(self, name, pid, hub):
        if name == "cards.json":
            return self.cards_json(pid)
        if name == "mistakes.json":
            return self.mistakes_json(pid)
        if name == "worked.json":
            return self.worked_json()
        if name == "diagnostic.json":
            return self.diagnostic_json()
        if name == "history.json":
            return self.history_json(pid)
        if name == "subjects.json":
            return self.subjects_json(pid, hub)
        if name == "review.json":
            return self.review_json(pid)
        if name == "dashboard.mock.json":
            return self.dashboard_json(pid, hub)
        return None
