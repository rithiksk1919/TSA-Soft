import os
import unittest

from skillbridge.db import Database
from skillbridge.service import Service, ServiceError
from skillbridge import coach


class ServiceFlowTests(unittest.TestCase):
    def setUp(self):
        self.svc = Service(Database(":memory:"))
        self.pid = self.svc.create_profile("Tester")["id"]

    def tearDown(self):
        self.svc.db.close()

    def test_profile_names_are_unique_and_validated(self):
        self.assertEqual(self.svc.create_profile("Tester")["id"], self.pid)
        with self.assertRaises(ServiceError):
            self.svc.create_profile("   ")

    def test_full_python_episode_is_tracked_and_updates_mastery(self):
        ep = self.svc.start_episode(self.pid, "python")
        eid = ep["id"]
        self.assertEqual(ep["selection"]["source"], "engine")
        self.assertTrue(ep["selection"]["reasons"])
        sc = self.svc.cat.scenarios[ep["scenario"]["id"]]
        self.svc.record_action(eid, "edit", {"code": sc["starter"] + "\n# thinking"})
        run = self.svc.record_action(eid, "run", {"code": sc["starter"], "snippet": "print('hi')"})
        self.assertIn("stdout", run)
        hint = self.svc.hint(eid)
        self.assertEqual(hint["hint_no"], 1)
        bad = self.svc.submit(eid, {"code": sc["starter"]})
        self.assertFalse(bad["result"]["passed"])
        self.assertFalse(bad["finished"])
        coach_mid = self.svc.coach(eid)
        self.assertEqual(coach_mid["source"], "coach")
        good = self.svc.submit(eid, {"code": sc["solution"]})
        self.assertTrue(good["finished"])
        self.assertAlmostEqual(good["score"], 1 - 0.2 - 0.15)
        for sk in sc["skills"]:
            old, new = good["mastery_changes"][sk]
            self.assertEqual(old, 0.3)
            self.assertNotEqual(new, old)
        types = [a["type"] for a in self.svc.episode(eid)["activity"]]
        for t in ("start", "edit", "run", "hint", "submit", "complete"):
            self.assertIn(t, types)
        done = self.svc.episode(eid)
        self.assertEqual(done["status"], "solved")
        self.assertIn("solution", done)
        self.assertIsNotNone(done["active_seconds"])
        dash = self.svc.dashboard(self.pid)
        self.assertEqual(dash["stats"]["solved"], 1)
        self.assertTrue(dash["recent_mistakes"])
        self.assertTrue(dash["mastery_series"])
        self.assertTrue(dash["selection_log"])
        with self.assertRaises(ServiceError):
            self.svc.submit(eid, {"code": "x"})

    def test_five_failures_end_episode_unsolved(self):
        eid = self.svc.start_episode(self.pid, "python")["id"]
        for i in range(5):
            out = self.svc.submit(eid, {"code": "pass"})
        self.assertTrue(out["finished"])
        self.assertEqual(out["status"], "failed")
        self.assertEqual(out["score"], 0.0)

    def test_circuit_episode_measure_and_diagnose(self):
        ep = self.svc.start_episode(self.pid, scenario_id="ck-04")
        self.assertEqual(ep["selection"]["mode"], "free_choice")
        m = self.svc.record_action(ep["id"], "measure", {"mode": "voltage", "red": "B", "black": "C"})
        self.assertEqual(m["display"], "9.00 V")
        out = self.svc.submit(ep["id"], {"component": "R2", "kind": "open"})
        self.assertTrue(out["result"]["passed"])
        self.assertEqual(out["status"], "solved")

    def test_diagnostic_sets_starting_mastery_and_locks_after_practice(self):
        items = self.svc.cat.diagnostics["python"]
        answers = {q["id"]: q["answer"] for q in items}
        answers[items[0]["id"]] = (items[0]["answer"] + 1) % 4
        answers[items[1]["id"]] = None
        res = self.svc.submit_diagnostic(self.pid, "python", answers)["result"]
        self.assertEqual(res[items[0]["skill"]]["mastery"], 0.2)
        self.assertEqual(res[items[1]["skill"]]["mastery"], 0.3)
        self.assertEqual(res[items[2]["skill"]]["mastery"], 0.5)
        st = self.svc.load_state(self.pid, "python")
        self.assertEqual(st.mastery[items[2]["skill"]], 0.5)
        self.assertEqual(st.updates[items[2]["skill"]], 0)
        eid = self.svc.start_episode(self.pid, "python")["id"]
        self.svc.give_up(eid)
        with self.assertRaises(ServiceError):
            self.svc.submit_diagnostic(self.pid, "python", answers)

    def test_abandon_without_work_does_not_count(self):
        e1 = self.svc.start_episode(self.pid, scenario_id="py-type-01")["id"]
        self.svc.start_episode(self.pid, scenario_id="py-cond-01")
        self.assertEqual(self.svc.episode(e1)["status"], "abandoned")
        self.assertEqual(self.svc.load_state(self.pid, "python").episodes, [])

    def test_coach_is_built_from_recorded_data(self):
        eid = self.svc.start_episode(self.pid, scenario_id="py-obo-01")["id"]
        self.svc.hint(eid)
        self.svc.submit(eid, {"code": self.svc.cat.scenarios["py-obo-01"]["starter"]})
        self.svc.give_up(eid)
        fb = self.svc.coach(eid)
        self.assertEqual(fb["source"], "coach")
        self.assertIn("range", fb["why"])                 # the scenario's verified explanation
        self.assertIn("1 hint", fb["what_happened"])      # the recorded hint count
        text = " ".join(str(v) for v in fb.values()).lower()
        self.assertNotIn("demo", text)
        self.assertNotIn("scripted", text)

    def test_coach_never_gives_the_answer_mid_attempt(self):
        sc = self.svc.cat.scenarios["py-obo-01"]
        eid = self.svc.start_episode(self.pid, scenario_id="py-obo-01")["id"]
        self.svc.submit(eid, {"code": sc["starter"]})
        fb = self.svc.coach(eid)
        self.assertNotIn(sc["explanation"], " ".join(str(v) for v in fb.values()))

    def test_get_feedback_is_the_single_coach_interface(self):
        actions = [{"type": "submit", "payload": {"passed": False, "failed_skills": ["py_loops"]}, "ts": 1.0},
                   {"type": "hint", "payload": {"hint_no": 1}, "ts": 2.0},
                   {"type": "submit", "payload": {"passed": True, "failed_skills": []}, "ts": 3.0}]
        result = {"passed": True, "tests": [{"name": "a", "passed": True}], "n_passed": 1, "total": 1,
                  "finished": True, "outcome": "solved", "score": 0.65}
        fb = coach.get_feedback(actions, result, {"title": "T", "skills": ["Loop conditions"],
                                                  "skill_names": {"py_loops": "Loop conditions"}, "explanation": "E."})
        self.assertIn("attempt 2", fb["headline"])
        self.assertIn("1 hint", fb["headline"])
        self.assertIn("Loop conditions", fb["what_happened"])
        self.assertIn("0.65", fb["what_happened"])
        self.assertEqual(fb["why"], "E.")


if __name__ == "__main__":
    unittest.main()
