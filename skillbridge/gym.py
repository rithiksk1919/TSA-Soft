"""The Gym: Bug Hoops, the transfer check.

One game is one episode with three rounds. Each round is a transfer scenario the
learner has never seen (new names, new story) for one skill. The learner clicks
the line with the bug; the bug_line evaluator grades the shot against the answer
key on the server. Hints are locked.

Making 2 of 3 shots with no hints solves the episode. Because the rounds are
never-seen scenarios in new surface forms, a solved game is the "transfer item"
the mastery rule asks for. A missed game sends the skill back to practice with a
worked example (see failed_transfer_check in the engine).
"""
from .db import dumps, now
from .engine import skill_statuses, transfer_skills_for
from .evaluators import bug_line
from .service import ServiceError, _j

ROUNDS = 3
PASS_MARK = 2


class Gym:
    def __init__(self, svc):
        self.svc = svc

    # ---- which skills can play ----------------------------------------------------
    def ready_skills(self, pid):
        """Skills at mastery 0.8 or more whose mastery is not confirmed yet."""
        ready = []
        for domain in self.svc.cat.domains:
            state = self.svc.load_state(pid, domain["id"])
            statuses = skill_statuses(self.svc.cat.engine_skills(domain["id"]),
                                      self.svc.cat.engine_catalog(domain["id"]), state)
            for status in statuses:
                if not status.transfer_pending:
                    continue
                if not self.svc.cat.transfer_for(status.skill):
                    continue
                skill = self.svc.cat.skill(status.skill)
                ready.append({"skill": status.skill, "name": skill["name"], "domain": domain["id"],
                              "mastery": round(status.mastery, 3)})
        return ready

    def rounds_already_played(self, pid, skill):
        """Transfer scenario id -> when it was last shown, for this learner and skill.
        A round counts as seen once it was on screen: the first round of every game started,
        and each later round after the shot before it."""
        played = {}
        rows = self.svc.db.q("SELECT id, selection, started_at FROM episodes WHERE profile_id = ? ORDER BY id", (pid,))
        for row in rows:
            selection = _j(row["selection"], {})
            if not selection.get("gym"):
                continue
            if selection.get("skill") != skill:
                continue
            shots = self.svc.db.one("SELECT COUNT(*) n FROM submissions WHERE episode_id = ?", (row["id"],))["n"]
            rounds = selection.get("rounds", [])
            shown = min(shots + 1, len(rounds))
            for index in range(shown):
                played[rounds[index]] = row["started_at"]
        return played

    def pick_rounds(self, pid, skill):
        """Never-played scenarios first. If fewer than three are left, the oldest ones are replayed,
        and then the game no longer counts as a fresh transfer check."""
        played = self.rounds_already_played(pid, skill)
        fresh = []
        old = []
        for scenario in self.svc.cat.transfer_for(skill):
            if scenario["id"] in played:
                old.append(scenario["id"])
            else:
                fresh.append(scenario["id"])
        old.sort(key=lambda scenario_id: played[scenario_id])
        rounds = fresh[:ROUNDS]
        all_fresh = len(rounds) == ROUNDS
        for scenario_id in old:
            if len(rounds) >= ROUNDS:
                break
            rounds.append(scenario_id)
        return rounds, all_fresh

    # ---- playing --------------------------------------------------------------------
    def start(self, pid, skill):
        svc = self.svc
        svc.profile(pid)
        ready_ids = []
        for item in self.ready_skills(pid):
            ready_ids.append(item["skill"])
        if skill not in ready_ids:
            raise ServiceError("The Gym opens for a skill once its mastery reaches 0.80.")

        domain = svc.cat.skill(skill)["domain"]
        svc.leave_gym_games(pid, domain)
        active = svc.active_episode(pid, domain)
        if active:
            svc.abandon(active["id"])

        rounds, all_fresh = self.pick_rounds(pid, skill)
        first = svc.cat.scenarios[rounds[0]]
        total_difficulty = 0.0
        for scenario_id in rounds:
            total_difficulty = total_difficulty + svc.cat.scenarios[scenario_id]["difficulty"]
        difficulty = round(total_difficulty / len(rounds), 3)

        transfer = []
        if all_fresh:
            state = svc.load_state(pid, domain)
            found = transfer_skills_for(svc.cat.engine_scenario(first), state.episodes)
            if skill in found:
                transfer.append(skill)

        reasons = ["Mastery for this skill is at least 0.80, so it needs a transfer check.",
                   "Three never-seen scenarios with new names and stories. Hints are locked."]
        if not all_fresh:
            reasons.append("Every transfer scenario for this skill has been played before, so this game is practice and does not count as a fresh transfer check.")
        selection = {"gym": True, "skill": skill, "rounds": rounds, "fresh": all_fresh, "mode": "transfer",
                     "priority": None, "target_difficulty": None, "worked_example": False, "hint_dependency": False,
                     "reasons": reasons, "skills_considered": [], "source": "gym"}
        ts = now()
        eid = svc.db.run(
            "INSERT INTO episodes(profile_id, scenario_id, domain, skills, difficulty, surface_form, status, transfer_skills, "
            "selection, worked_example, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (pid, rounds[0], domain, dumps([skill]), difficulty, first["surface_form"], "active",
             dumps(transfer), dumps(selection), 0, ts))
        svc.db.run("INSERT INTO selection_log(profile_id, domain, episode_id, scenario_id, skill, priority, target_difficulty, mode, "
                   "reasons, skills_considered, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                   (pid, domain, eid, rounds[0], skill, None, None, "transfer", dumps(reasons), dumps([]), ts))
        svc.db.log_action(pid, eid, "start", {"gym": True, "skill": skill, "rounds": rounds}, ts)
        return self.state(eid)

    def episode_row(self, eid):
        row = self.svc._episode_row(eid)
        if not _j(row["selection"], {}).get("gym"):
            raise ServiceError("That is not a Gym game.")
        return row

    def state(self, eid):
        row = self.episode_row(eid)
        selection = _j(row["selection"], {})
        shots = self.svc.db.q("SELECT payload, result FROM submissions WHERE episode_id = ? ORDER BY id", (eid,))
        rounds = []
        made = 0
        for index, scenario_id in enumerate(selection["rounds"]):
            scenario = self.svc.cat.scenarios[scenario_id]
            item = {"round": index + 1, "id": scenario_id, "title": scenario["title"], "story": scenario["prompt"],
                    "kicker": scenario.get("kicker", ""), "lines": list(scenario["evaluator"]["lines"]), "shot": None}
            if index < len(shots):
                result = _j(shots[index]["result"], {})
                item["shot"] = {"made": result["passed"], "chosen_line": result["chosen_line"],
                                "correct_line": result["correct_line"], "explanation": scenario["explanation"]}
                if result["passed"]:
                    made = made + 1
            rounds.append(item)
        skill = self.svc.cat.skill(selection["skill"])
        return {"id": eid, "profile_id": row["profile_id"], "skill": skill["id"], "skill_name": skill["name"],
                "domain": row["domain"], "status": row["status"], "rounds": rounds, "shots_taken": len(shots),
                "made": made, "pass_mark": PASS_MARK, "fresh": selection.get("fresh", False),
                "counts_as_transfer": bool(_j(row["transfer_skills"], [])), "hints_locked": True}

    def shoot(self, eid, chosen_line):
        svc = self.svc
        row = self.episode_row(eid)
        if row["status"] != "active":
            raise ServiceError("This game is over.")
        selection = _j(row["selection"], {})
        shots_taken = svc.db.one("SELECT COUNT(*) n FROM submissions WHERE episode_id = ?", (eid,))["n"]
        if shots_taken >= ROUNDS:
            raise ServiceError("All three shots are taken.")

        scenario_id = selection["rounds"][shots_taken]
        scenario = svc.cat.scenarios[scenario_id]
        result = bug_line.evaluate(scenario["evaluator"], chosen_line, scenario["skills"])
        ts = now()
        payload = {"round": shots_taken + 1, "scenario_id": scenario_id, "line": result["chosen_line"]}
        svc.db.run("INSERT INTO submissions(episode_id, profile_id, attempt_no, passed, failed_skills, payload, result, ts) "
                   "VALUES (?,?,?,?,?,?,?,?)", (eid, row["profile_id"], shots_taken + 1, int(result["passed"]),
                                                dumps(result["failed_skills"]), dumps(payload), dumps(result), ts))
        svc.db.run("UPDATE episodes SET attempts = ? WHERE id = ?", (shots_taken + 1, eid))
        svc.db.log_action(row["profile_id"], eid, "shot", dict(payload, made=result["passed"]), ts)

        out = {"round": shots_taken + 1, "made": result["passed"], "chosen_line": result["chosen_line"],
               "correct_line": result["correct_line"], "explanation": scenario["explanation"], "finished": False}
        if shots_taken + 1 == ROUNDS:
            out["finished"] = True
            out["result"] = self.finish(eid)
        return out

    def finish(self, eid):
        """Three shots taken: score the game as one episode. attempts = misses + 1, hints = 0."""
        svc = self.svc
        made = svc.db.one("SELECT COUNT(*) n FROM submissions WHERE episode_id = ? AND passed = 1", (eid,))["n"]
        misses = ROUNDS - made
        svc.db.run("UPDATE episodes SET attempts = ?, hints = 0 WHERE id = ?", (misses + 1, eid))
        passed = made >= PASS_MARK
        finished = svc._finish(eid, passed)
        finished["made"] = made
        finished["passed"] = passed
        return finished
