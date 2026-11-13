"""The Gym's warm-up minigames: Dodgeball, Loop Laps and Ohm Toss.

Bug Hoops (gym.py) is the transfer check and opens for a skill at mastery 0.80. Before then its
hoop runs the Shootaround here: the same game on practice problems. These four games are open at any mastery: short drills that teach one rule per item. Each game draws its items
from content/gym/<game>.json, aimed at the learner's weakest skills, and every answer is graded here
against the answer key (the browser never sees it before it answers).

Drills are practice, like a lunchroom break: they never change mastery, so the engine's rules stay
exactly as documented. Every start, answer and finish is logged to the actions table (they show up
in the exports and keep the study streak going), and the drill's id is the id of its start action.
"""
import json

from .content import CONTENT_DIR
from .db import now
from .engine import skill_statuses
from .service import ServiceError, _j

GAMES = {
    "dodgeball": {"name": "Dodgeball", "tagline": "Bug or clean?", "domains": ["python", "circuits"], "rounds": 6,
                  "blurb": "Each ball carries a short function or a circuit step. Dodge the bugs, catch the clean ones."},
    "laps": {"name": "Loop Laps", "tagline": "Trace the loop", "domains": ["python"], "rounds": 4,
             "blurb": "Predict what a loop does, then watch the runner trace it one lap per pass."},
    "toss": {"name": "Ohm Toss", "tagline": "Land the right value", "domains": ["circuits"], "rounds": 5,
             "blurb": "Work out the circuit value and toss the beanbag onto the ring that matches."},
    # Bug Hoops before a skill is ready for its transfer check: practice problems, never the
    # transfer scenarios, so the real check stays fresh.
    "shootaround": {"name": "Shootaround", "tagline": "Bug Hoops practice", "domains": ["python", "circuits"],
                    "rounds": 4, "blurb": "Click the line with the bug to take your shot. Practice problems, so the real transfer check stays fresh for when a skill reaches 0.80."},
}
FOCUS_SKILLS = 3


def number(value):
    """20 -> "20", 0.2 -> "0.2", 4.5 -> "4.5"."""
    return format(value, "g")


class GymGames:
    def __init__(self, svc, content_dir=None):
        self.svc = svc
        base = (content_dir or CONTENT_DIR) / "gym"
        self.items = {}
        self.by_game = {}
        for game in GAMES:
            data = json.loads((base / (game + ".json")).read_text(encoding="utf-8"))
            self.by_game[game] = []
            for item in data["items"]:
                svc.cat.skill(item["skill"])  # unknown skill ids fail loudly at start-up
                item = dict(item, game=game)
                self.items[item["id"]] = item
                self.by_game[game].append(item)

    # ---- choosing items -------------------------------------------------------------------
    def mastery(self, pid):
        out = {}
        for domain in self.svc.cat.domains:
            state = self.svc.load_state(pid, domain["id"])
            for status in skill_statuses(self.svc.cat.engine_skills(domain["id"]),
                                         self.svc.cat.engine_catalog(domain["id"]), state):
                out[status.skill] = status.mastery
        return out

    def answers(self, pid):
        rows = self.svc.db.q("SELECT payload, ts FROM actions WHERE profile_id = ? AND type = 'drill_answer' ORDER BY id", (pid,))
        return [dict(_j(row["payload"], {}), ts=row["ts"]) for row in rows]

    def skills_in(self, game):
        seen = []
        for item in self.by_game[game]:
            if item["skill"] not in seen:
                seen.append(item["skill"])
        return seen

    def focus(self, game, mastery, skill=None):
        """The weakest skills this game has items for (or just the one asked for)."""
        if skill:
            return [skill]
        skills = sorted(self.skills_in(game), key=lambda s: (mastery.get(s, 0.3), s))
        return skills[:FOCUS_SKILLS]

    def pick(self, pid, game, skill=None):
        """Round-robin over the focus skills, least-practised items first; other skills fill any gap."""
        mastery = self.mastery(pid)
        focus = self.focus(game, mastery, skill)
        seen = {}
        for answer in self.answers(pid):
            count, _ = seen.get(answer.get("item"), (0, 0))
            seen[answer.get("item")] = (count + 1, answer["ts"])
        queues = {}
        for item in self.by_game[game]:
            queues.setdefault(item["skill"], []).append(item)
        for queue in queues.values():
            queue.sort(key=lambda it: (seen.get(it["id"], (0, 0)), it["id"]))
        order = list(focus)
        for other in sorted(queues, key=lambda s: (mastery.get(s, 0.3), s)):
            if other not in order:
                order.append(other)
        size = GAMES[game]["rounds"]
        picked = []
        for group in (focus, order):
            while len(picked) < size and any(queues.get(s) for s in group):
                for s in group:
                    if queues.get(s) and len(picked) < size:
                        picked.append(queues[s].pop(0)["id"])
        return picked, focus

    # ---- what the browser sees ------------------------------------------------------------
    def public(self, item):
        out = {"id": item["id"], "skill": item["skill"], "skill_name": self.svc.cat.skill(item["skill"])["name"]}
        if item["game"] == "dodgeball":
            out.update(kind=item["kind"], goal=item["goal"], lines=item["lines"])
        elif item["game"] == "laps":
            out.update(lines=item["lines"], watch=item["watch"], ask=item["ask"], choices=item["choices"])
        elif item["game"] == "shootaround":
            out.update(title=item["title"], story=item["story"], lines=item["lines"])
        else:
            out.update(ask=item["ask"], unit=item["unit"], choices=[number(c) for c in item["choices"]])
        return out

    def reveal(self, item):
        out = {"why": item["why"], "answer": item["answer"]}
        if item["game"] == "laps":
            out["trace"] = item["trace"]
        return out

    def overview(self, pid):
        mastery = self.mastery(pid)
        finishes = self.svc.db.q("SELECT payload FROM actions WHERE profile_id = ? AND type = 'drill_finish'", (pid,))
        best = {}
        played = {}
        for row in finishes:
            p = _j(row["payload"], {})
            played[p["game"]] = played.get(p["game"], 0) + 1
            best[p["game"]] = max(best.get(p["game"], 0), p["score"])
        games = []
        for key, info in GAMES.items():
            skills = []
            for s in self.skills_in(key):
                skills.append({"skill": s, "name": self.svc.cat.skill(s)["name"], "mastery": round(mastery.get(s, 0.3), 2)})
            focus = []
            for s in self.focus(key, mastery):
                focus.append(self.svc.cat.skill(s)["name"])
            games.append({"id": key, "name": info["name"], "tagline": info["tagline"], "blurb": info["blurb"],
                          "rounds": info["rounds"], "domains": info["domains"], "skills": skills, "focus": focus,
                          "best": best.get(key), "played": played.get(key, 0)})
        return {"games": games}

    # ---- playing ---------------------------------------------------------------------------
    def start(self, pid, game, skill=None):
        self.svc.profile(pid)
        if game not in GAMES:
            raise ServiceError("There is no such game in the gym.")
        if skill and skill not in self.skills_in(game):
            raise ServiceError("That game has no items for this skill.")
        picked, focus = self.pick(pid, game, skill)
        did = self.svc.db.log_action(pid, None, "drill_start", {"game": game, "items": picked, "focus": focus, "skill": skill}, now())
        return self.state(did)

    def start_row(self, did):
        row = self.svc.db.one("SELECT profile_id, payload FROM actions WHERE id = ? AND type = 'drill_start'", (did,))
        if not row:
            raise ServiceError("That drill does not exist.")
        return row["profile_id"], _j(row["payload"], {})

    def given(self, pid, did):
        out = []
        for answer in self.answers(pid):
            if answer.get("drill") == did:
                out.append(answer)
        return out

    def state(self, did):
        pid, start = self.start_row(did)
        done = self.given(pid, did)
        items = []
        for index, item_id in enumerate(start["items"]):
            item = self.items[item_id]
            entry = self.public(item)
            if index < len(done):
                entry["result"] = dict(self.reveal(item), choice=done[index]["choice"], correct=done[index]["correct"])
            items.append(entry)
        info = GAMES[start["game"]]
        out = {"id": did, "game": start["game"], "name": info["name"], "tagline": info["tagline"], "items": items,
               "answered": len(done), "score": sum(1 for a in done if a["correct"]),
               "focus": [self.svc.cat.skill(s)["name"] for s in start["focus"]], "finished": len(done) == len(items)}
        if out["finished"]:
            out["summary"] = self.summary(pid, did, start, done)
        return out

    def grade(self, item, choice):
        if item["game"] == "dodgeball":
            if choice not in ("bug", "clean"):
                raise ServiceError("Call it bug or clean.")
            return choice, choice == item["answer"]
        try:
            choice = int(choice)
        except (TypeError, ValueError):
            raise ServiceError("Pick one of the answers.")
        options = item["lines"] if item["game"] == "shootaround" else item["choices"]
        if choice < 0 or choice >= len(options):
            raise ServiceError("Pick one of the answers.")
        return choice, choice == item["answer"]

    def answer(self, did, index, choice):
        pid, start = self.start_row(did)
        done = self.given(pid, did)
        if len(done) >= len(start["items"]):
            raise ServiceError("This drill is over.")
        if index is not None and int(index) != len(done):
            raise ServiceError("That item was already answered.")
        item = self.items[start["items"][len(done)]]
        choice, correct = self.grade(item, choice)
        ts = now()
        self.svc.db.log_action(pid, None, "drill_answer", {"drill": did, "game": start["game"], "item": item["id"],
                                                          "skill": item["skill"], "index": len(done), "choice": choice,
                                                          "correct": correct}, ts)
        out = dict(self.reveal(item), index=len(done), choice=choice, correct=correct,
                   finished=len(done) + 1 == len(start["items"]))
        if out["finished"]:
            done = self.given(pid, did)
            score = sum(1 for a in done if a["correct"])
            self.svc.db.log_action(pid, None, "drill_finish", {"drill": did, "game": start["game"], "score": score,
                                                              "of": len(done)}, ts)
            out["summary"] = self.summary(pid, did, start, done)
        return out

    def summary(self, pid, did, start, done):
        """Per-skill tallies, the rules missed, and the skill that most needs the classroom."""
        tally = {}
        order = []
        for answer in done:
            s = answer["skill"]
            if s not in tally:
                tally[s] = {"skill": s, "name": self.svc.cat.skill(s)["name"], "right": 0, "of": 0}
                order.append(s)
            tally[s]["of"] += 1
            if answer["correct"]:
                tally[s]["right"] += 1
        rules = []
        for answer in done:
            item = self.items[answer["item"]]
            rules.append({"item": item["id"], "skill_name": tally[item["skill"]]["name"], "why": item["why"],
                          "correct": answer["correct"]})
        lesson = None
        worst = sorted(order, key=lambda s: (tally[s]["right"] - tally[s]["of"], order.index(s)))
        if worst and tally[worst[0]]["right"] < tally[worst[0]]["of"]:
            lesson = {"skill": worst[0], "name": tally[worst[0]]["name"]}
        previous = 0
        for row in self.svc.db.q("SELECT payload FROM actions WHERE profile_id = ? AND type = 'drill_finish'", (pid,)):
            p = _j(row["payload"], {})
            if p.get("game") == start["game"] and p.get("drill") != did:
                previous = max(previous, p["score"])
        score = sum(1 for a in done if a["correct"])
        return {"score": score, "of": len(done), "skills": [tally[s] for s in order], "rules": rules,
                "lesson": lesson, "previous_best": previous, "new_best": score > previous}
