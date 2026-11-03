import os
import unittest

from skillbridge.db import Database
from skillbridge.service import Service
from skillbridge import demo
from sim import simulate


class DemoTests(unittest.TestCase):
    def test_demo_learners_share_first_scenario_but_diverge(self):
        os.environ.pop("ANTHROPIC_API_KEY", None)
        svc = Service(Database(":memory:"))
        out = demo.reset_demo(svc)
        maya, leo = out["Maya Patel"], out["Leo Garcia"]
        self.assertEqual(maya["first"], leo["first"])
        self.assertNotEqual(maya["next"], leo["next"])
        # each is sent to the skill their own mistakes implicated
        self.assertEqual(maya["next_skill"], "py_conditionals")
        self.assertEqual(leo["next_skill"], "py_loops")
        # identical outcome scores, so only the recorded mistakes differ
        a = svc.episode(svc.history(maya["profile_id"])[0]["id"])
        b = svc.episode(svc.history(leo["profile_id"])[0]["id"])
        self.assertEqual(a["mastery_changes"], b["mastery_changes"])
        self.assertNotEqual(a["submissions"][0]["failed_skills"], b["submissions"][0]["failed_skills"])
        # reasons are shown with names, not ids
        self.assertIn("Conditional logic", maya["reasons"][0])
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
