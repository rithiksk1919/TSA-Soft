"""Hub, Classroom lessons, the Gym (Bug Hoops), the Lunchroom flag, the live library data, and the HTTP routes."""
import json
import re
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

from skillbridge import content, demo
from skillbridge.db import Database, now
from skillbridge.engine import is_mastered, recommend
from skillbridge.evaluators import bug_line
from skillbridge.gym import Gym
from skillbridge.hub import Hub
from skillbridge.lessons import load_lesson
from skillbridge.library import Library
from skillbridge.service import Service, ServiceError

ROOT = Path(__file__).resolve().parent.parent
BANNED = re.compile(r"physics|chemistry|biology|khan|worksheet|extension|scripted demo|demo tutor", re.I)


class Base(unittest.TestCase):
    def setUp(self):
        self.svc = Service(Database(":memory:"))
        self.lib = Library(self.svc)
        self.gym = Gym(self.svc)
        self.hub = Hub(self.svc, self.lib, self.gym)
        self.pid = self.svc.create_profile("Tester")["id"]

    def tearDown(self):
        self.svc.db.close()

    def set_mastery(self, skill, value):
        self.svc.db.run("INSERT INTO mastery(profile_id, skill, mastery, updates) VALUES (?,?,?,5) "
                        "ON CONFLICT(profile_id, skill) DO UPDATE SET mastery = excluded.mastery", (self.pid, skill, value))

    def solve(self, scenario_id):
        eid = self.svc.start_episode(self.pid, scenario_id=scenario_id)["id"]
        return self.svc.submit(eid, {"code": self.svc.cat.scenarios[scenario_id]["solution"]})

    def fail_engine_pick(self):
        ep = self.svc.start_episode(self.pid, "python")
        self.svc.submit(ep["id"], {"code": self.svc.cat.scenarios[ep["scenario"]["id"]]["starter"]})
        self.svc.give_up(ep["id"])
        return ep

    def ready_for_gym(self):
        """Loop conditions at the mastery line, with one near-level practice solve already done."""
        self.set_mastery("py_conditionals", 0.7)
        self.set_mastery("py_loops", 0.82)
        self.solve("py-loop-03")             # difficulty 0.75: near the learner's level
        self.assertIn("py_loops", [r["skill"] for r in self.gym.ready_skills(self.pid)])

    def play(self, eid, hits):
        """Take three shots; hits[i] says whether round i aims at the right line."""
        state = self.gym.state(eid)
        last = None
        for index in range(3):
            answer = self.svc.cat.scenarios[state["rounds"][index]["id"]]["evaluator"]["answer"]
            line = answer if hits[index] else (answer + 1) % len(state["rounds"][index]["lines"])
            last = self.gym.shoot(eid, line)
        return last


class TransferContent(Base):
    def test_three_transfer_scenarios_per_skill_never_used_in_practice(self):
        cat = self.svc.cat
        practice_forms = set()
        for domain in cat.domains:
            for sc in cat.scenarios_in(domain["id"]):
                self.assertNotEqual(sc.get("pool"), "transfer")
                practice_forms.add(sc["surface_form"])
        for skill in cat.skills:
            items = cat.transfer_for(skill["id"])
            self.assertGreaterEqual(len(items), 3, skill["id"])
            for sc in items:
                self.assertEqual(sc["hints"], [])
                self.assertNotIn(sc["surface_form"], practice_forms)
        public = self.svc.catalog_public()["scenarios"]
        self.assertFalse(any(s["id"].startswith("tx-") for s in public))
        with self.assertRaises(ServiceError):
            self.svc.start_episode(self.pid, scenario_id="tx-loop-vending")

    def test_answer_key_never_reaches_the_browser(self):
        pub = content.public_scenario(self.svc.cat.scenarios["tx-loop-vending"])
        self.assertNotIn("answer", pub["evaluator"])
        self.assertNotIn("explanation", pub)

    def test_python_transfer_snippets_are_valid_python(self):
        for sc in self.svc.cat.scenarios.values():
            if sc.get("pool") == "transfer" and sc["domain"] == "python":
                compile("\n".join(sc["evaluator"]["lines"]), sc["id"], "exec")

    def test_bug_line_evaluator(self):
        ev = {"lines": ["a", "b", "c"], "answer": 1}
        self.assertTrue(bug_line.evaluate(ev, 1, ["py_loops"])["passed"])
        miss = bug_line.evaluate(ev, 2, ["py_loops"])
        self.assertFalse(miss["passed"])
        self.assertEqual(miss["failed_skills"], ["py_loops"])
        self.assertEqual(miss["correct_line"], 1)
        self.assertFalse(bug_line.evaluate(ev, "nope", ["py_loops"])["passed"])
        self.assertFalse(bug_line.evaluate(ev, 9, ["py_loops"])["passed"])


class GymGame(Base):
    def test_gym_is_closed_below_the_mastery_line(self):
        with self.assertRaises(ServiceError):
            self.gym.start(self.pid, "py_loops")

    def test_rounds_are_never_seen_and_hints_are_locked(self):
        self.ready_for_gym()
        state = self.gym.start(self.pid, "py_loops")
        ids = [r["id"] for r in state["rounds"]]
        self.assertEqual(len(set(ids)), 3)
        for scenario_id in ids:
            self.assertEqual(self.svc.cat.scenarios[scenario_id]["pool"], "transfer")
        self.assertTrue(state["counts_as_transfer"])
        with self.assertRaises(ServiceError):
            self.svc.hint(state["id"])
        with self.assertRaises(ServiceError):
            self.svc.submit(state["id"], {"code": "x"})

    def test_two_of_three_passes_and_confirms_mastery(self):
        self.ready_for_gym()
        eid = self.gym.start(self.pid, "py_loops")["id"]
        last = self.play(eid, [True, False, True])
        self.assertTrue(last["finished"])
        self.assertTrue(last["result"]["passed"])
        self.assertEqual(last["result"]["made"], 2)
        self.assertIn("py_loops", last["result"]["newly_mastered"])
        state = self.svc.load_state(self.pid, "python")
        self.assertTrue(is_mastered("py_loops", state))
        row = self.svc.db.one("SELECT status, attempts, hints, score FROM episodes WHERE id = ?", (eid,))
        self.assertEqual((row["status"], row["attempts"], row["hints"]), ("solved", 2, 0))
        self.assertAlmostEqual(row["score"], 0.8)          # o = 1 - 0.2 x (2 - 1): one miss
        shots = self.svc.db.q("SELECT passed FROM submissions WHERE episode_id = ?", (eid,))
        self.assertEqual([s["passed"] for s in shots], [1, 0, 1])

    def test_a_missed_game_sends_the_skill_back_with_a_worked_example(self):
        self.ready_for_gym()
        eid = self.gym.start(self.pid, "py_loops")["id"]
        last = self.play(eid, [True, False, False])
        self.assertFalse(last["result"]["passed"])
        rec = self.svc.recommendation(self.pid, "python", only_skill="py_loops")
        self.assertEqual(rec["mode"], "remedial")
        self.assertTrue(rec["worked_example"])
        waiting = [w["skill"] for w in self.hub.summary(self.pid)["rooms"]["classroom"]["waiting"]]
        self.assertIn("py_loops", waiting)

    def test_only_rounds_on_screen_count_as_seen(self):
        self.ready_for_gym()
        first = self.gym.start(self.pid, "py_loops")          # round 1 shown, then left without a shot
        second = self.gym.start(self.pid, "py_loops")
        self.assertTrue(second["fresh"] is False or second["rounds"][0]["id"] != first["rounds"][0]["id"])
        self.assertEqual(self.svc.db.one("SELECT status FROM episodes WHERE id = ?", (first["id"],))["status"], "abandoned")

    def test_leaving_after_a_shot_counts_as_not_solved(self):
        self.ready_for_gym()
        eid = self.gym.start(self.pid, "py_loops")["id"]
        self.play_one(eid, False)
        self.svc.start_episode(self.pid, "python")               # walk away to practice
        self.assertEqual(self.svc.db.one("SELECT status FROM episodes WHERE id = ?", (eid,))["status"], "failed")

    def play_one(self, eid, hit):
        state = self.gym.state(eid)
        round_info = state["rounds"][state["shots_taken"]]
        answer = self.svc.cat.scenarios[round_info["id"]]["evaluator"]["answer"]
        line = answer
        if not hit:
            line = (answer + 1) % len(round_info["lines"])
        return self.gym.shoot(eid, line)

    def test_replaying_seen_problems_does_not_count_as_a_fresh_check(self):
        self.ready_for_gym()
        first = self.gym.start(self.pid, "py_loops")["id"]
        self.play(first, [True, False, False])
        self.set_mastery("py_loops", 0.85)
        again = self.gym.start(self.pid, "py_loops")
        self.assertFalse(again["fresh"])
        self.assertFalse(again["counts_as_transfer"])


class ClassroomLessons(Base):
    def test_every_skill_has_a_lesson_with_three_stations(self):
        for skill in self.svc.cat.skills:
            lesson = load_lesson(self.svc.cat, skill["id"])
            self.assertTrue(lesson["chalkboard"]["code"])
            self.assertTrue(lesson["chalkboard"]["steps"])
            self.assertGreaterEqual(len(lesson["textbook"]["pages"]), 2)
            self.assertTrue(lesson["listen"]["transcript"])
            if skill["domain"] == "python":
                self.assertFalse(lesson["generated"], skill["id"])       # hand-written lessons

    def test_python_chalkboards_trace_memory_and_mark_one_error(self):
        for skill in self.svc.cat.skills_in("python"):
            board = load_lesson(self.svc.cat, skill["id"])["chalkboard"]
            errors = [s for s in board["steps"] if s.get("error")]
            self.assertEqual(len(errors), 1, skill["id"])
            self.assertTrue(errors[0]["error_label"])
            for step in board["steps"]:
                self.assertTrue(0 <= step["line"] < len(board["code"]), skill["id"])
                self.assertIn("global", step["memory"])
                self.assertIn("local", step["memory"])
            compile("\n".join(board["code"]), skill["id"], "exec")

    def test_two_misses_in_a_row_wait_in_the_classroom_until_the_lesson_is_opened(self):
        self.svc.submit_diagnostic(self.pid, "python", {})
        self.fail_engine_pick()
        self.fail_engine_pick()
        summary = self.hub.summary(self.pid)
        waiting = summary["rooms"]["classroom"]["waiting"]
        self.assertTrue(waiting)
        self.assertIn("worked example", summary["rooms"]["classroom"]["label"])
        self.assertEqual(summary["next_up"]["room"], "classroom")
        self.assertEqual(summary["next_up"]["action"], "worked example first")
        skill = waiting[0]["skill"]
        self.svc.db.log_action(self.pid, None, "lesson_viewed", {"skill": skill}, now() + 1)
        after = [w["skill"] for w in self.hub.summary(self.pid)["rooms"]["classroom"]["waiting"]]
        self.assertNotIn(skill, after)

    def test_new_learner_starts_with_the_diagnostic_then_new_skills_go_to_the_classroom(self):
        first = self.hub.summary(self.pid)["next_up"]
        self.assertEqual(first["action"], "take the starting diagnostic")
        self.assertEqual(first["room"], "classroom")
        self.svc.submit_diagnostic(self.pid, "python", {})
        second = self.hub.summary(self.pid)["next_up"]
        self.assertEqual(second["action"], "learn it first")


class HubSummary(Base):
    def test_demo_learners_share_a_start_and_get_different_next_steps(self):
        out = demo.reset_demo(self.svc)
        self.assertEqual(out["Priya Nair"]["first"], out["Marcus Reed"]["first"])
        picks = {}
        for profile in self.svc.list_profiles():
            if profile["is_demo"]:
                summary = self.hub.summary(profile["id"])
                picks[profile["name"]] = summary["next_up"]["skill"]
                d = summary["next_up"]["decision"]
                self.assertAlmostEqual(d["priority"], (1 - d["mastery"]) + 0.3 * d["error_rate"] + d["recency_bonus"], places=2)
                keys = [pair[0] for pair in d["log"]]
                self.assertEqual(keys, ["skill", "mastery", "error_rate", "priority", "target", "prereq", "hint_dep", "action"])
                self.assertTrue(summary["demo"]["switch_to"])
        self.assertNotEqual(picks["Priya Nair"], picks["Marcus Reed"])

    def test_mastery_rows_always_carry_a_text_state(self):
        demo.reset_demo(self.svc)
        for profile in self.svc.list_profiles():
            for row in self.hub.summary(profile["id"])["mastery"]:
                self.assertTrue(row["state"])

    def test_hint_dependency_lights_up_the_lunchroom(self):
        self.assertFalse(self.hub.summary(self.pid)["rooms"]["lunch"]["nudge"])
        for scenario_id in ("py-obo-01", "py-cond-01", "py-type-01"):
            eid = self.svc.start_episode(self.pid, scenario_id=scenario_id)["id"]
            self.svc.hint(eid)
            self.svc.submit(eid, {"code": self.svc.cat.scenarios[scenario_id]["solution"]})
        lunch = self.hub.summary(self.pid)["rooms"]["lunch"]
        self.assertTrue(lunch["nudge"])
        self.assertEqual(lunch["label"], "Hints on 3 of last 3. Take 5.")
        rec = self.svc.recommendation(self.pid, "python")
        self.assertTrue(rec["hint_dependency"])            # the engine prefers more scaffolded scenarios

    def test_mistakes_due_come_from_the_database(self):
        self.assertEqual(self.hub.summary(self.pid)["mistakes_due"], 0)
        self.fail_engine_pick()
        due = self.hub.summary(self.pid)["mistakes_due"]
        self.assertGreater(due, 0)
        mistake = self.lib.mistakes_due(self.pid)[0]
        for card in mistake["cards"]:
            self.lib.set_box(self.pid, card["id"], 3)
        self.assertEqual(self.hub.summary(self.pid)["mistakes_due"], due - 1)


class LiveLibraryData(Base):
    def test_library_files_keep_their_shapes(self):
        demo.reset_demo(self.svc)
        pid = self.svc.list_profiles()[0]["id"]
        cards = self.lib.file("cards.json", pid, self.hub)
        self.assertEqual({s["id"] for s in cards["subjects"]}, {"python", "circuits"})
        for mistake in cards["mistakes"]:
            for card in mistake["cards"]:
                self.assertTrue(0 <= card["answer"] < len(card["options"]))
        subjects = self.lib.file("subjects.json", pid, self.hub)
        self.assertIn("log", subjects["subjects"][0]["next"])
        self.assertTrue(self.lib.file("worked.json", pid, self.hub)["examples"])
        self.assertTrue(self.lib.file("history.json", pid, self.hub)["attempts"])
        dash = self.lib.file("dashboard.mock.json", pid, self.hub)
        self.assertEqual(len(dash["stats"]), 4)

    def test_no_old_subjects_or_extension_wording(self):
        demo.reset_demo(self.svc)
        for profile in self.svc.list_profiles():
            for name in ("cards.json", "mistakes.json", "worked.json", "diagnostic.json", "history.json",
                         "subjects.json", "dashboard.mock.json"):
                text = json.dumps(self.lib.file(name, profile["id"], self.hub))
                self.assertIsNone(BANNED.search(text), name)
        desk = (ROOT / "static/library/data/desk.json").read_text()
        self.assertIsNone(BANNED.search(desk))


class HttpRoutes(Base):
    def setUp(self):
        super().setUp()
        demo.reset_demo(self.svc)
        from skillbridge.server import App, make_handler
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(App(self.svc)))
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        super().tearDown()

    def get(self, path, cookie=None):
        headers = {}
        if cookie:
            headers["Cookie"] = cookie
        with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:%d%s" % (self.port, path), headers=headers)) as r:
            return r.read()

    def test_pages_api_and_live_library_files(self):
        ids = {p["name"]: p["id"] for p in self.svc.list_profiles()}
        for path in ("/", "/hub/app.js", "/library/", "/library/dashboard.html", "/practice/"):
            self.get(path)
        priya = json.loads(self.get("/library/data/subjects.json", "sb_profile=%d" % ids["Priya Nair"]))
        marcus = json.loads(self.get("/library/data/subjects.json", "sb_profile=%d" % ids["Marcus Reed"]))
        self.assertEqual(priya["learner"]["name"], "Priya Nair")
        self.assertEqual(marcus["learner"]["name"], "Marcus Reed")
        hub = json.loads(self.get("/api/profiles/%d/hub" % ids["Priya Nair"]))
        self.assertEqual(set(hub["rooms"]), {"classroom", "library", "gym", "lunch"})
        lesson = json.loads(self.get("/api/profiles/%d/lesson/py_scope" % ids["Priya Nair"]))
        self.assertEqual(lesson["title"], "Where variables live")

    def test_static_files_cannot_escape_their_folder(self):
        with self.assertRaises(urllib.error.HTTPError):
            self.get("/library/../../skillbridge/db.py")


if __name__ == "__main__":
    unittest.main()
