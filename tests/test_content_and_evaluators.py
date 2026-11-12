import unittest
from collections import defaultdict

from skillbridge import content
from skillbridge.evaluators import circuits, python_runner


CAT = content.load()


class ContentTests(unittest.TestCase):
    def test_counts(self):
        self.assertTrue(15 <= len(CAT.scenarios_in("python")) <= 20)
        self.assertTrue(10 <= len(CAT.scenarios_in("circuits")) <= 12)
        self.assertEqual(len(CAT.skills_in("python")), 6)

    def test_two_surface_forms_per_skill(self):
        forms = defaultdict(set)
        for sc in CAT.scenarios.values():
            for sk in sc["skills"]:
                forms[sk].add(sc["surface_form"])
        for s in CAT.skills:
            self.assertGreaterEqual(len(forms[s["id"]]), 2, s["id"])

    def test_prereq_graph_is_acyclic_and_has_roots(self):
        prereqs = {s["id"]: s.get("prereqs", []) for s in CAT.skills}
        state = {}

        def visit(n):
            self.assertNotEqual(state.get(n), "visiting", f"cycle at {n}")
            if state.get(n) == "done":
                return
            state[n] = "visiting"
            for p in prereqs[n]:
                visit(p)
            state[n] = "done"
        for n in prereqs:
            visit(n)
        for d in CAT.domains:
            self.assertTrue(any(not s.get("prereqs") for s in CAT.skills_in(d["id"])))

    def test_every_skill_has_worked_example_and_diagnostic_item(self):
        for s in CAT.skills:
            self.assertIn("worked_example", s)
            self.assertTrue(any(q["skill"] == s["id"] for q in CAT.diagnostics[s["domain"]]), s["id"])

    def test_public_view_hides_answers(self):
        for sc in CAT.scenarios.values():
            pub = content.public_scenario(sc)
            for hidden in ("solution", "explanation", "hints"):
                self.assertNotIn(hidden, pub)
            self.assertNotIn("fault", pub["evaluator"])
            if sc["evaluator"]["type"] == "python_tests":
                for t, pt in zip(sc["evaluator"]["tests"], pub["evaluator"]["tests"]):
                    if not t.get("visible"):
                        self.assertEqual(set(pt), {"name", "visible"})
            if sc["evaluator"]["type"] == "circuit_calc":
                self.assertNotIn("answer", pub["evaluator"]["question"])

    def test_circuit_layouts_are_axis_aligned(self):
        for sc in CAT.scenarios_in("circuits"):
            c = sc["evaluator"]["circuit"]
            for comp in c["components"]:
                (x1, y1), (x2, y2) = c["nodes"][comp["a"]], c["nodes"][comp["b"]]
                self.assertTrue(x1 == x2 or y1 == y2, f"{sc['id']} {comp['id']}")


class PythonScenarioTests(unittest.TestCase):
    """Every buggy starter must fail and every reference solution must pass."""
    def test_starters_fail_solutions_pass(self):
        for sc in CAT.scenarios_in("python"):
            with self.subTest(sc["id"]):
                ev = sc["evaluator"]
                self.assertFalse(python_runner.evaluate(sc["starter"], ev, sc["skills"])["passed"])
                self.assertTrue(python_runner.evaluate(sc["solution"], ev, sc["skills"])["passed"])


class SandboxTests(unittest.TestCase):
    cfg = {"entry": "f", "tests": [{"name": "t", "args": [1], "expected": 1}]}

    def test_infinite_loop_times_out(self):
        r = python_runner.evaluate("def f(x):\n    while True: pass", self.cfg, ["s"])
        self.assertFalse(r["passed"])
        self.assertEqual(r["tests"][0]["error"]["type"], "Timeout")

    def test_network_and_writes_blocked(self):
        self.assertIn("not allowed", python_runner.run_snippet("import socket", "")["error"]["message"])
        self.assertIn("not allowed", python_runner.run_snippet("open('x.txt', 'w')", "")["error"]["message"])
        self.assertIn("not allowed", python_runner.run_snippet("import os\nos.system('echo hi')", "")["error"]["message"])

    def test_syntax_error_reported(self):
        r = python_runner.evaluate("def f(x) return x", self.cfg, ["s"])
        self.assertEqual(r["error"]["type"], "SyntaxError")
        self.assertEqual(r["failed_skills"], ["s"])

    def test_hidden_tests_hide_inputs(self):
        r = python_runner.evaluate("def f(x): return 2", self.cfg, ["s"])
        self.assertNotIn("got", r["tests"][0])
        self.assertNotIn("expected", r["tests"][0])

    def test_failed_skills_follow_test_tags(self):
        cfg = {"entry": "f", "tests": [{"name": "a", "args": [1], "expected": 1, "skills": ["x"]},
                                       {"name": "b", "args": [2], "expected": 3, "skills": ["y"]}]}
        r = python_runner.evaluate("def f(v): return v", cfg, ["x", "y"])
        self.assertEqual(r["failed_skills"], ["y"])


class CircuitTests(unittest.TestCase):
    def test_ohms_law_and_divider(self):
        c = {"ground": "G", "nodes": {"A": [0, 0], "B": [1, 0], "G": [0, 1]},
             "components": [{"id": "V1", "type": "battery", "a": "A", "b": "G", "value": 12},
                            {"id": "R1", "type": "resistor", "a": "A", "b": "B", "value": 1000},
                            {"id": "R2", "type": "resistor", "a": "B", "b": "G", "value": 3000}]}
        sol = circuits.solve(c)
        self.assertAlmostEqual(sol["v"]["B"], 9.0, places=4)
        self.assertAlmostEqual(sol["i"]["R1"], 0.003, places=6)
        opened = circuits.solve(c, {"component": "R2", "kind": "open"})
        self.assertAlmostEqual(opened["v"]["B"], 12.0, places=3)

    def test_calc_answers_match_solver(self):
        for sc in CAT.scenarios_in("circuits"):
            ev = sc["evaluator"]
            if ev["type"] != "circuit_calc":
                continue
            sol = circuits.solve(ev["circuit"])
            vals = {abs(i) * 1000 for i in sol["i"].values()} | {abs(sol["v"][a] - sol["v"][b]) for a in sol["v"] for b in sol["v"]}
            self.assertTrue(any(abs(v - ev["question"]["answer"]) < 1e-3 for v in vals), sc["id"])

    def test_every_fault_is_observable_with_allowed_meter(self):
        for sc in CAT.scenarios_in("circuits"):
            ev = sc["evaluator"]
            if ev["type"] != "circuit_fault":
                continue
            healthy, bad = circuits.solve(ev["circuit"]), circuits.solve(ev["circuit"], ev["fault"])
            dv = max(abs(healthy["v"][n] - bad["v"][n]) for n in healthy["v"])
            di = max(abs(healthy["i"][k] - bad["i"][k]) for k in healthy["i"])
            self.assertTrue(dv > 0.1 or ("current" in ev["meter"] and di > 1e-4), sc["id"])

    def test_fault_evaluation(self):
        sc = CAT.scenarios["ck-06"]
        ev = sc["evaluator"]
        ok = circuits.evaluate_fault(ev, {"component": "R2", "kind": "wrong_value", "value": 3250}, sc["skills"])
        self.assertTrue(ok["passed"])
        off = circuits.evaluate_fault(ev, {"component": "R2", "kind": "wrong_value", "value": 2000}, sc["skills"])
        self.assertFalse(off["passed"])
        self.assertIn("ck_ohms", off["failed_skills"])
        wrong_kind = circuits.evaluate_fault(ev, {"component": "R2", "kind": "open"}, sc["skills"])
        self.assertEqual(wrong_kind["failed_skills"], ["ck_value"])
        wrong_part = circuits.evaluate_fault(ev, {"component": "R1", "kind": "open"}, sc["skills"])
        self.assertEqual(set(wrong_part["failed_skills"]), set(sc["skills"]))

    def test_meter_modes_enforced(self):
        ev = CAT.scenarios["ck-11"]["evaluator"]
        with self.assertRaises(ValueError):
            circuits.measure(ev, "current", component="R1")
        r = circuits.measure(ev, "voltage", "C", "D")
        self.assertEqual(r["display"], "0.00 V")


if __name__ == "__main__":
    unittest.main()
