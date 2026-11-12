import math
import unittest

from skillbridge.engine.learner_model import (
    attempt_score, expected_success, update_mastery, learning_rate,
)
from skillbridge.engine.adaptive import (
    Skill, Scenario, Episode, Submission, LearnerState,
    recommend, apply_episode, is_mastered, hint_dependency, error_rate,
    recency_bonus, priority, transfer_skills_for, consecutive_failures,
)


class AttemptScoreTests(unittest.TestCase):
    def test_first_try_no_hints_is_one(self):
        self.assertEqual(attempt_score(True, 1, 0), 1.0)

    def test_attempt_and_hint_penalties(self):
        self.assertAlmostEqual(attempt_score(True, 2, 0), 0.8)
        self.assertAlmostEqual(attempt_score(True, 1, 1), 0.85)
        self.assertAlmostEqual(attempt_score(True, 2, 1), 0.65)

    def test_floor_of_point_four_when_solved(self):
        self.assertEqual(attempt_score(True, 5, 3), 0.4)

    def test_unsolved_is_zero(self):
        self.assertEqual(attempt_score(False, 1, 0), 0.0)
        self.assertEqual(attempt_score(False, 5, 3), 0.0)


class UpdateTests(unittest.TestCase):
    def test_expected_success_formula(self):
        self.assertAlmostEqual(expected_success(0.5, 0.5), 0.5)
        self.assertAlmostEqual(expected_success(0.3, 0.5), 1 / (1 + math.exp(-6 * (0.3 - 0.5))))
        self.assertGreater(expected_success(0.9, 0.2), 0.95)

    def test_learning_rate_schedule(self):
        self.assertEqual([learning_rate(n) for n in range(5)], [0.25, 0.25, 0.25, 0.12, 0.12])

    def test_update_moves_toward_outcome(self):
        p = expected_success(0.3, 0.5)
        self.assertAlmostEqual(update_mastery(0.3, 1.0, 0.5, 0), 0.3 + 0.25 * (1 - p))
        self.assertAlmostEqual(update_mastery(0.3, 0.0, 0.5, 5), 0.3 + 0.12 * (0 - p))

    def test_update_is_clamped(self):
        self.assertEqual(update_mastery(0.0, 0.0, 0.9, 0), 0.0)
        self.assertLessEqual(update_mastery(1.0, 1.0, 0.0, 0), 1.0)
        self.assertGreaterEqual(update_mastery(0.01, 0.0, 0.0, 0), 0.0)

    def test_apply_episode_updates_every_skill_and_counts(self):
        st = LearnerState()
        ep = Episode("s1", ("a", "b"), 0.5, "f", True, 1, 0)
        changes = apply_episode(st, ep, [Submission(("a", "b"), (), True)])
        self.assertEqual(set(changes), {"a", "b"})
        self.assertEqual(st.updates, {"a": 1, "b": 1})
        self.assertGreater(st.mastery["a"], 0.3)
        # 4th update uses the smaller alpha
        for i in range(3):
            apply_episode(st, Episode(f"x{i}", ("a",), 0.5, "f", True, 1, 0), [])
        self.assertEqual(st.updates["a"], 4)


def mk(id, skills, d, form="f", scaffold=0, domain="d"):
    return Scenario(id, domain, tuple(skills), d, form, scaffold, id)


SKILLS = [
    Skill("base", "Base", "d"),
    Skill("adv", "Advanced", "d", ("base",)),
    Skill("other", "Other", "d"),
]


class PriorityTests(unittest.TestCase):
    def test_error_rate_uses_failed_skills_over_last_five(self):
        subs = [Submission(("a",), ("a",), False)] * 3 + [Submission(("a",), (), True)] * 5
        self.assertEqual(error_rate("a", subs), 0.0)
        subs = [Submission(("a", "b"), ("b",), False)] * 2 + [Submission(("a",), (), True)] * 2
        self.assertEqual(error_rate("a", subs), 0.0)
        self.assertEqual(error_rate("b", subs), 1.0)

    def test_recency_bonus(self):
        eps = [Episode("1", ("a",), .5, "f", True, 1, 0), Episode("2", ("b",), .5, "f", True, 1, 0)]
        self.assertAlmostEqual(recency_bonus("b", eps), 0.0)
        self.assertAlmostEqual(recency_bonus("a", eps), 0.02)
        self.assertAlmostEqual(recency_bonus("never", eps), 0.10)

    def test_priority_formula(self):
        st = LearnerState(mastery={"a": 0.4})
        st.submissions = [Submission(("a",), ("a",), False), Submission(("a",), (), True)]
        self.assertAlmostEqual(priority("a", st), 0.6 + 0.3 * 0.5 + 0.10)


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.catalog = [
            mk("b1", ["base"], 0.2), mk("b2", ["base"], 0.45), mk("b3", ["base"], 0.8, "g"),
            mk("a1", ["adv"], 0.3), mk("a2", ["adv"], 0.6),
            mk("o1", ["other"], 0.3), mk("o2", ["other"], 0.5, scaffold=2), mk("o3", ["other"], 0.52),
        ]

    def test_picks_highest_priority_and_closest_difficulty(self):
        st = LearnerState(mastery={"base": 0.6, "adv": 0.6, "other": 0.3})
        rec = recommend(SKILLS, self.catalog, st)
        self.assertEqual(rec.skill, "other")
        self.assertAlmostEqual(rec.target_difficulty, 0.4)
        self.assertEqual(rec.scenario_id, "o1")      # 0.3 and 0.5 are equally close to 0.4: tie broken by id

    def test_prerequisite_gate(self):
        # adv has the lowest mastery but its prerequisite is below 0.5
        st = LearnerState(mastery={"base": 0.45, "adv": 0.05, "other": 0.9})
        rec = recommend(SKILLS, self.catalog, st)
        self.assertEqual(rec.skill, "base")
        self.assertTrue(any("Skipped 'adv'" in r for r in rec.reasons))
        st.mastery["base"] = 0.5
        self.assertEqual(recommend(SKILLS, self.catalog, st).skill, "adv")

    def test_unseen_only(self):
        st = LearnerState(mastery={"base": 0.9, "adv": 0.9, "other": 0.3})
        st.episodes = [Episode("o1", ("other",), 0.3, "f", True, 1, 0)]
        st.mastery["other"] = 0.3
        rec = recommend(SKILLS, self.catalog, st)
        self.assertNotEqual(rec.scenario_id, "o1")

    def test_two_failures_lower_target_and_show_worked_example(self):
        st = LearnerState(mastery={"base": 0.9, "adv": 0.9, "other": 0.42})
        st.episodes = [Episode("o3", ("other",), 0.52, "f", False, 5, 0), Episode("o2", ("other",), 0.5, "f", False, 5, 0)]
        rec = recommend(SKILLS, self.catalog, st)
        self.assertEqual(rec.mode, "remedial")
        self.assertTrue(rec.worked_example)
        self.assertAlmostEqual(rec.target_difficulty, 0.42)
        self.assertEqual(rec.scenario_id, "o1")
        self.assertEqual(consecutive_failures("other", st.episodes), 2)

    def test_missed_transfer_check_lowers_target_and_shows_worked_example(self):
        st = LearnerState(mastery={"base": 0.9, "adv": 0.9, "other": 0.42})
        # one failure only, but it was a transfer check for "other"
        st.episodes = [Episode("o3", ("other",), 0.52, "new-form", False, 2, 0, ("other",))]
        rec = recommend(SKILLS, self.catalog, st)
        self.assertEqual(rec.mode, "remedial")
        self.assertTrue(rec.worked_example)
        self.assertAlmostEqual(rec.target_difficulty, 0.42)
        self.assertEqual(consecutive_failures("other", st.episodes), 1)

    def test_hint_dependency_prefers_scaffolded(self):
        eps = [Episode(f"x{i}", ("base",), 0.2, "f", True, 1, 1 if i < 3 else 0) for i in range(5)]
        self.assertEqual(hint_dependency(eps)[0], True)
        self.assertEqual(hint_dependency(eps[:2])[0], False)       # 2 of 2 is not "> half of 5"
        st = LearnerState(mastery={"base": 0.9, "adv": 0.9, "other": 0.42}, episodes=eps)
        rec = recommend(SKILLS, self.catalog, st)
        self.assertTrue(rec.hint_dependency)
        self.assertEqual(rec.scenario_id, "o2")                    # scaffold 2 beats a closer difficulty
        self.assertEqual(rec.mode, "scaffolded")

    def test_deterministic(self):
        st = LearnerState(mastery={"base": 0.3, "adv": 0.3, "other": 0.3})
        self.assertEqual(recommend(SKILLS, self.catalog, st).to_dict(), recommend(SKILLS, self.catalog, st).to_dict())

    def test_review_fallback_when_everything_seen(self):
        st = LearnerState(mastery={"base": 0.3, "adv": 0.1, "other": 0.3})
        st.episodes = [Episode(s.id, s.skills, s.difficulty, s.surface_form, True, 1, 0) for s in self.catalog]
        rec = recommend(SKILLS, self.catalog, st)
        self.assertEqual(rec.mode, "review")
        self.assertIsNotNone(rec.scenario_id)


class MasteryRuleTests(unittest.TestCase):
    def ep(self, sid, d, solved=True, hints=0, form="f", transfer=False):
        return Episode(sid, ("s",), d, form, solved, 1, hints, ("s",) if transfer else ())

    def test_requires_threshold(self):
        st = LearnerState(mastery={"s": 0.79}, episodes=[self.ep("1", .6), self.ep("2", .7, transfer=True)])
        self.assertFalse(is_mastered("s", st))

    def test_requires_transfer_without_hints(self):
        st = LearnerState(mastery={"s": 0.85}, episodes=[self.ep("1", .6), self.ep("2", .7)])
        self.assertFalse(is_mastered("s", st))
        st.episodes[-1] = self.ep("2", .7, hints=1, transfer=True)
        self.assertFalse(is_mastered("s", st))
        st.episodes[-1] = self.ep("2", .7, transfer=True)
        self.assertTrue(is_mastered("s", st))

    def test_requires_last_two_near_solved(self):
        st = LearnerState(mastery={"s": 0.85}, episodes=[self.ep("1", .6, transfer=True), self.ep("2", .7, solved=False)])
        self.assertFalse(is_mastered("s", st))

    def test_easy_scenarios_do_not_count_as_near(self):
        # an easy solve (0.2 < 0.85 - 0.4) is ignored when looking for the last two near-difficulty scenarios
        st = LearnerState(mastery={"s": 0.85}, episodes=[self.ep("1", .6, transfer=True), self.ep("2", .2)])
        self.assertFalse(is_mastered("s", st))
        st.episodes.insert(0, self.ep("0", .7))
        self.assertTrue(is_mastered("s", st))

    def test_transfer_detection(self):
        eps = [Episode("a", ("s",), .3, "loops", True, 1, 0)]
        self.assertEqual(transfer_skills_for(mk("b", ["s"], .5, "strings"), eps), ("s",))
        self.assertEqual(transfer_skills_for(mk("c", ["s"], .5, "loops"), eps), ())   # same surface form
        self.assertEqual(transfer_skills_for(mk("a", ["s"], .3, "x"), eps), ())        # already seen
        self.assertEqual(transfer_skills_for(mk("d", ["t"], .3, "x"), eps), ())        # skill never practiced

    def test_transfer_mode_selected_when_pending(self):
        cat = [mk("1", ["s"], .5, "f"), mk("2", ["s"], .9, "g"), mk("3", ["s"], .88, "f")]
        st = LearnerState(mastery={"s": 0.82}, episodes=[Episode("1", ("s",), .5, "f", True, 1, 0)])
        rec = recommend([Skill("s", "S", "d")], cat, st)
        self.assertEqual(rec.mode, "transfer")
        self.assertEqual(rec.scenario_id, "2")   # "3" is closer but shares the practiced surface form

    def test_mastered_skill_is_not_recommended(self):
        cat = [mk("1", ["s"], .6, "f"), mk("2", ["s"], .7, "g"), mk("3", ["s"], .9, "h"), mk("4", ["t"], .9)]
        st = LearnerState(mastery={"s": 0.85, "t": 0.95},
                          episodes=[self.ep("1", .6), self.ep("2", .7, form="g", transfer=True)])
        self.assertTrue(is_mastered("s", st))
        rec = recommend([Skill("s", "S", "d"), Skill("t", "T", "d")], cat, st)
        self.assertEqual(rec.skill, "t")


if __name__ == "__main__":
    unittest.main()
