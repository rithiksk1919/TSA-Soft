"""The Gym's minigames: every answer key is proved by running it, and the drills are graded and logged."""
import json
import math
import sys
import unittest
from pathlib import Path

from skillbridge.db import Database
from skillbridge.gym_games import GAMES, GymGames
from skillbridge.service import Service, ServiceError

ROOT = Path(__file__).resolve().parent.parent
GYM = ROOT / "content" / "gym"


def load(game):
    return json.loads((GYM / (game + ".json")).read_text(encoding="utf-8"))["items"]


def run_laps(item):
    """Runs a Loop Laps snippet under a tracer. Returns (the watched values at the end of each lap,
    the globals afterwards). A lap opens on the first line of the loop body and closes when control
    comes back to the loop header or leaves the frame."""
    lines = item["lines"]
    header = next(i for i, line in enumerate(lines) if line.strip().startswith(("while ", "for ")))
    indent = len(lines[header]) - len(lines[header].lstrip())
    body = set()
    for i in range(header + 1, len(lines)):
        if lines[i].strip() and len(lines[i]) - len(lines[i].lstrip()) <= indent:
            break
        body.add(i + 1)
    laps = []
    state = {"open": None}

    def snap(frame):
        values = {}
        for name in item["watch"]:
            if name in frame.f_locals:
                values[name] = repr(frame.f_locals[name])
        return values

    def local(frame, event, arg):
        if event == "line":
            if frame.f_lineno == header + 1 and state["open"] is frame:
                laps.append(snap(frame))
                state["open"] = None
            elif frame.f_lineno in body and state["open"] is None:
                state["open"] = frame
        elif event == "return" and state["open"] is frame:
            laps.append(snap(frame))
            state["open"] = None
        return local

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<lap>":
            return None
        return local

    scope = {}
    code = compile("\n".join(lines), "<lap>", "exec")
    sys.settrace(tracer)
    try:
        exec(code, scope)
    finally:
        sys.settrace(None)
    return laps, scope


class ContentTest(unittest.TestCase):
    def test_dodgeball_python_checks_pass_only_when_clean(self):
        for item in load("dodgeball"):
            if item["kind"] != "code":
                continue
            with self.subTest(item["id"]):
                scope = {}
                exec("\n".join(item["lines"]), scope)
                try:
                    exec(item["check"], scope)
                    passed = True
                except Exception:
                    passed = False
                self.assertEqual(passed, item["answer"] == "clean")

    def test_dodgeball_claims_match_only_when_clean(self):
        for item in load("dodgeball"):
            if item["kind"] != "claim":
                continue
            with self.subTest(item["id"]):
                actual = eval(item["actual"])
                same = math.isclose(item["claimed"], actual, abs_tol=1e-9)
                self.assertEqual(same, item["answer"] == "clean")

    def test_every_skill_has_dodgeball_items_of_both_kinds(self):
        items = load("dodgeball")
        self.assertTrue(any(i["answer"] == "bug" for i in items))
        self.assertTrue(any(i["answer"] == "clean" for i in items))
        skills = {i["skill"] for i in items}
        self.assertEqual(len(skills), 12)

    def test_laps_traces_and_answers_are_what_python_does(self):
        for item in load("laps"):
            with self.subTest(item["id"]):
                laps, scope = run_laps(item)
                self.assertEqual(laps, item["trace"])
                if item["kind"] == "laps":
                    self.assertEqual(item["choices"][item["answer"]], str(len(laps)))
                else:
                    self.assertEqual(item["choices"][item["answer"]], repr(eval(item["expr"], scope)))
                self.assertEqual(len(set(item["choices"])), len(item["choices"]))

    def test_toss_answers_are_the_calculated_value_and_unique(self):
        for item in load("toss"):
            with self.subTest(item["id"]):
                value = eval(item["calc"])
                hits = [i for i, c in enumerate(item["choices"]) if math.isclose(c, value, rel_tol=1e-9, abs_tol=1e-9)]
                self.assertEqual(hits, [item["answer"]])
                self.assertEqual(len(item["choices"]), 4)

    def test_shootaround_python_bugs_are_on_the_marked_line(self):
        for item in load("shootaround"):
            if "check" not in item:
                continue
            with self.subTest(item["id"]):
                for fixed in (False, True):
                    lines = list(item["lines"])
                    if fixed:
                        lines[item["answer"]] = item["fix"]
                    scope = {}
                    try:
                        exec("\n".join(lines), scope)
                        exec(item["check"], scope)
                        passed = True
                    except Exception:
                        passed = False
                    self.assertEqual(passed, fixed)

    def test_shootaround_covers_every_skill_and_never_uses_transfer_scenarios(self):
        items = load("shootaround")
        self.assertEqual(len({i["skill"] for i in items}), 12)
        transfer = {p.stem for p in (ROOT / "content" / "transfer").glob("*.json")}
        self.assertFalse(transfer & {i["id"] for i in items})
        for item in items:
            self.assertLess(item["answer"], len(item["lines"]))

    def test_item_ids_are_unique(self):
        ids = []
        for game in GAMES:
            ids += [i["id"] for i in load(game)]
        self.assertEqual(len(ids), len(set(ids)))


class DrillTest(unittest.TestCase):
    def setUp(self):
        self.svc = Service(Database(":memory:"))
        self.games = GymGames(self.svc)
        self.pid = self.svc.create_profile("Tester")["id"]

    def tearDown(self):
        self.svc.db.close()

    def set_mastery(self, skill, value):
        self.svc.db.run("INSERT INTO mastery(profile_id, skill, mastery, updates) VALUES (?,?,?,5) "
                        "ON CONFLICT(profile_id, skill) DO UPDATE SET mastery = excluded.mastery", (self.pid, skill, value))

    def test_start_hides_the_answers(self):
        drill = self.games.start(self.pid, "laps")
        self.assertEqual(len(drill["items"]), GAMES["laps"]["rounds"])
        for item in drill["items"]:
            self.assertNotIn("answer", item)
            self.assertNotIn("trace", item)
            self.assertNotIn("why", item)

    def test_items_aim_at_the_weakest_skills(self):
        for skill in ("ck_ohms", "ck_series", "ck_parallel", "ck_open", "ck_short", "ck_value"):
            self.set_mastery(skill, 0.7)
        self.set_mastery("ck_short", 0.1)
        drill = self.games.start(self.pid, "toss")
        self.assertEqual(drill["items"][0]["skill"], "ck_short")
        self.assertEqual(drill["focus"][0], "Short faults")

    def test_one_skill_can_be_chosen(self):
        drill = self.games.start(self.pid, "dodgeball", "py_scope")
        self.assertEqual(drill["items"][0]["skill"], "py_scope")
        with self.assertRaises(ServiceError):
            self.games.start(self.pid, "laps", "ck_ohms")

    def test_grading_logging_and_summary(self):
        drill = self.games.start(self.pid, "dodgeball")
        right = 0
        for index, item in enumerate(drill["items"]):
            key = self.games.items[item["id"]]["answer"]
            choice = key if index % 2 == 0 else ("clean" if key == "bug" else "bug")
            out = self.games.answer(drill["id"], index, choice)
            self.assertEqual(out["correct"], index % 2 == 0)
            self.assertEqual(out["answer"], key)
            self.assertTrue(out["why"])
            right += out["correct"]
        self.assertTrue(out["finished"])
        self.assertEqual(out["summary"]["score"], right)
        self.assertTrue(out["summary"]["new_best"])
        self.assertIsNotNone(out["summary"]["lesson"])
        with self.assertRaises(ServiceError):
            self.games.answer(drill["id"], 6, "bug")
        types = [r["type"] for r in self.svc.db.q("SELECT type FROM actions WHERE profile_id = ?", (self.pid,))]
        self.assertEqual(types.count("drill_answer"), 6)
        self.assertEqual(types.count("drill_finish"), 1)
        again = self.games.state(drill["id"])
        self.assertTrue(again["finished"])
        self.assertEqual(again["items"][0]["result"]["answer"], self.games.items[drill["items"][0]["id"]]["answer"])

    def test_answers_must_come_in_order_and_be_valid(self):
        drill = self.games.start(self.pid, "toss")
        with self.assertRaises(ServiceError):
            self.games.answer(drill["id"], 1, 0)
        with self.assertRaises(ServiceError):
            self.games.answer(drill["id"], 0, 7)
        with self.assertRaises(ServiceError):
            self.games.answer(drill["id"], 0, "x")
        self.games.answer(drill["id"], 0, 0)
        with self.assertRaises(ServiceError):
            self.games.answer(drill["id"], 0, 0)

    def test_drills_never_change_mastery(self):
        before = self.games.mastery(self.pid)
        drill = self.games.start(self.pid, "laps")
        for index in range(len(drill["items"])):
            self.games.answer(drill["id"], index, 0)
        self.assertEqual(self.games.mastery(self.pid), before)

    def test_replays_rotate_to_items_not_yet_played(self):
        first = self.games.start(self.pid, "laps", "py_off_by_one")
        for index in range(2):
            self.games.answer(first["id"], index, 0)
        second = self.games.start(self.pid, "laps", "py_off_by_one")
        played = [i["id"] for i in first["items"][:2]]
        self.assertNotIn(second["items"][0]["id"], played)

    def test_overview_lists_games_and_best(self):
        drill = self.games.start(self.pid, "toss")
        for index, item in enumerate(drill["items"]):
            self.games.answer(drill["id"], index, self.games.items[item["id"]]["answer"])
        games = {g["id"]: g for g in self.games.overview(self.pid)["games"]}
        self.assertEqual(set(games), {"dodgeball", "laps", "toss", "shootaround"})
        self.assertEqual(games["toss"]["best"], 5)
        self.assertEqual(len(games["toss"]["focus"]), 3)


if __name__ == "__main__":
    unittest.main()
