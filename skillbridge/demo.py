"""Seeded demo mode.

Two pre-made learners take the same diagnostic, so the engine gives them the
same first scenario. They make *different* mistakes on it:
  * Maya fixes the loop guard but twice gets the comparison wrong (`<= 0`,
    then `not > 0`), so the zero-is-not-negative check, tagged Conditional
    logic, fails.
  * Leo twice gets the loop guard wrong (`i <= len(nums)`, then the guard in
    the wrong order), so the empty-list and no-negative checks, tagged Loop
    conditions, crash with IndexError.
Both then solve it on attempt 3 with no hints, so their mastery updates are
identical. Only the per-skill error rate differs, and that is enough for the
engine to send each of them to their own weak skill next.

Every step goes through the real service: real sandboxed test runs, real
evaluator verdicts, real engine decisions.
"""
from __future__ import annotations

import time

from .service import Service

DEMO_PROFILES = ("Maya Patel", "Leo Garcia")
FIRST_SCENARIO = "py-loop-02"

MAYA_BUGGY = '''def first_negative(nums):
    # index of the first number below zero, or -1 if there is none
    i = 0
    while i < len(nums):
        if nums[i] <= 0:
            return i
        i += 1
    return -1
'''

MAYA_BUGGY_2 = MAYA_BUGGY.replace("if nums[i] <= 0:", "if not nums[i] > 0:")

LEO_BUGGY = '''def first_negative(nums):
    # index of the first number below zero, or -1 if there is none
    i = 0
    while i <= len(nums):
        if nums[i] < 0:
            return i
        i += 1
    return -1
'''

LEO_BUGGY_2 = LEO_BUGGY.replace("while i <= len(nums):", "while nums[i] >= 0 and i < len(nums):")


def _diagnostic_answers(svc: Service) -> dict:
    """Same answers for both: unsure about loops, wrong on off-by-one, right on the rest."""
    answers = {}
    for q in svc.cat.diagnostics["python"]:
        if q["skill"] == "py_loops":
            answers[q["id"]] = None
        elif q["skill"] == "py_off_by_one":
            answers[q["id"]] = (q["answer"] + 1) % len(q["options"])
        else:
            answers[q["id"]] = q["answer"]
    return answers


def reset_demo(svc: Service) -> dict:
    for r in svc.db.q("SELECT id FROM profiles WHERE is_demo = 1"):
        svc.delete_profile(r["id"])
    solution = svc.cat.scenarios[FIRST_SCENARIO]["solution"]
    starter = svc.cat.scenarios[FIRST_SCENARIO]["starter"]
    out = {}
    base = time.time() - 2 * 3600
    for k, (name, mistakes) in enumerate(zip(DEMO_PROFILES, ((MAYA_BUGGY, MAYA_BUGGY_2), (LEO_BUGGY, LEO_BUGGY_2)))):
        pid = svc.create_profile(name, is_demo=True)["id"]
        t = base + k * 600
        svc.submit_diagnostic(pid, "python", _diagnostic_answers(svc))
        ep = svc.start_episode(pid, "python", ts=t)
        if ep["scenario"]["id"] != FIRST_SCENARIO:
            raise RuntimeError(f"demo expected {FIRST_SCENARIO}, engine chose {ep['scenario']['id']}")
        eid = ep["id"]
        svc.record_action(eid, "run", {"code": starter, "snippet": "print(first_negative([1, 2, 3]))"}, ts=t + 40)
        for j, buggy in enumerate(mistakes):
            svc.record_action(eid, "edit", {"code": buggy}, ts=t + 95 + 80 * j)
            svc.submit(eid, {"code": buggy}, ts=t + 110 + 80 * j)
        svc.record_action(eid, "edit", {"code": solution}, ts=t + 260)
        svc.submit(eid, {"code": solution}, ts=t + 275)
        svc.coach(eid)
        rec = svc.recommendation(pid, "python")
        out[name] = {"profile_id": pid, "first": FIRST_SCENARIO, "next": rec["scenario_id"], "next_skill": rec["skill"],
                     "reasons": rec["reasons"]}
    a, b = (out[n]["next"] for n in DEMO_PROFILES)
    if a == b:
        raise RuntimeError("demo learners should diverge after different mistakes")
    return out
