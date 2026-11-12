import os
import unittest

from skillbridge.db import Database
from skillbridge.service import Service
from skillbridge import demo
from sim import simulate


class DemoTests(unittest.TestCase):
    def test_demo_learners_share_first_scenario_but_diverge(self):
        svc = Service(Database(":memory:"))
        out = demo.reset_demo(svc)
        priya, marcus = out["Priya Nair"], out["Marcus Reed"]
        self.assertEqual(priya["first"], marcus["first"])
        self.assertNotEqual(priya["next"], marcus["next"])
        # each is sent to the skill their own mistakes implicated
        self.assertEqual(priya["next_skill"], "py_conditionals")
        self.assertEqual(marcus["next_skill"], "py_loops")
        # identical outcome scores, so only the recorded mistakes differ
        a = svc.episode(svc.history(priya["profile_id"])[0]["id"])
        b = svc.episode(svc.history(marcus["profile_id"])[0]["id"])
        self.assertEqual(a["mastery_changes"], b["mastery_changes"])
        self.assertNotEqual(a["submissions"][0]["failed_skills"], b["submissions"][0]["failed_skills"])
        # reasons are shown with names, not ids
        self.assertIn("Conditional logic", priya["reasons"][0])
        svc.db.close()


class SimulationSmokeTest(unittest.TestCase):
    def test_estimates_track_truth_and_weaknesses_steer_selection(self):
        res = simulate.run(n_learners=60, steps=20, seed=3)
        summary = simulate.summarize(res, first_k=8)
        py = summary["python"]
        self.assertGreater(py["pearson_r_final"], 0.6)
        self.assertLess(py["mae_final"], py["mae_initial"])
        g = py["groups"]
        self.assertEqual(max(g["weak types"]["skill_share_first_k"], key=g["weak types"]["skill_share_first_k"].get), "py_types")
        self.assertEqual(max(g["weak conditionals"]["skill_share_first_k"], key=g["weak conditionals"]["skill_share_first_k"].get), "py_conditionals")
        self.assertLess(py["identical_first_k_across_groups"], 0.05)


if __name__ == "__main__":
    unittest.main()
