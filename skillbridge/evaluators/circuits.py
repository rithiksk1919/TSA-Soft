"""Deterministic evaluator for the circuit troubleshooting module.

DC circuits made of batteries, resistors and wires are solved exactly with
modified nodal analysis (MNA). A scenario's hidden fault (open, short or wrong
value) changes one component; the virtual multimeter reads the faulted circuit.
"""
from __future__ import annotations

import math

WIRE_R = 1e-3        # ohms: an ideal wire, kept non-zero so the matrix stays well conditioned
SHORT_R = 1e-3
OPEN_R = 1e12
GMIN = 1e-12         # tiny leak from every node to ground so floating nodes have a defined voltage
KIND_SKILL = {"open": "ck_open", "short": "ck_short", "wrong_value": "ck_value"}
FAULT_KINDS = ("open", "short", "wrong_value")


def _resistance(comp: dict, fault: dict | None) -> float:
    r = WIRE_R if comp["type"] == "wire" else float(comp["value"])
    if fault and fault.get("component") == comp["id"]:
        kind = fault["kind"]
        if kind == "open":
            return OPEN_R
        if kind == "short":
            return SHORT_R
        if kind == "wrong_value":
            return float(fault["actual"])
    return r


def _gauss_solve(a: list[list[float]], b: list[float]) -> list[float]:
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[piv][col]) < 1e-30:
            raise ValueError("singular circuit matrix")
        m[col], m[piv] = m[piv], m[col]
        for r in range(n):
            if r != col and m[r][col] != 0.0:
                f = m[r][col] / m[col][col]
                for c in range(col, n + 1):
                    m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def solve(circuit: dict, fault: dict | None = None) -> dict:
    """Return {"v": {node: volts}, "i": {component: amps from a to b}}."""
    ground = circuit["ground"]
    nodes = [n for n in circuit["nodes"] if n != ground]
    idx = {n: i for i, n in enumerate(nodes)}
    sources = [c for c in circuit["components"] if c["type"] == "battery"]
    size = len(nodes) + len(sources)
    A = [[0.0] * size for _ in range(size)]
    z = [0.0] * size
    for n in nodes:
        A[idx[n]][idx[n]] += GMIN
    for c in circuit["components"]:
        if c["type"] == "battery":
            continue
        g = 1.0 / _resistance(c, fault)
        a, b = idx.get(c["a"]), idx.get(c["b"])
        if a is not None:
            A[a][a] += g
        if b is not None:
            A[b][b] += g
        if a is not None and b is not None:
            A[a][b] -= g
            A[b][a] -= g
    for k, s in enumerate(sources):
        row = len(nodes) + k
        a, b = idx.get(s["a"]), idx.get(s["b"])     # a = + terminal, b = - terminal
        if a is not None:
            A[a][row] += 1
            A[row][a] += 1
        if b is not None:
            A[b][row] -= 1
            A[row][b] -= 1
        z[row] = float(s["value"])
    x = _gauss_solve(A, z)
    v = {n: x[idx[n]] for n in nodes}
    v[ground] = 0.0
    i = {}
    for c in circuit["components"]:
        if c["type"] == "battery":
            continue
        i[c["id"]] = (v[c["a"]] - v[c["b"]]) / _resistance(c, fault)
    for k, s in enumerate(sources):
        i[s["id"]] = -x[len(nodes) + k]       # current delivered out of the + terminal
    return {"v": v, "i": i}


def _fmt_ohms(r: float) -> str:
    if r >= 1e9:
        return "OL"
    if r >= 1000:
        return f"{r / 1000:.2f} kΩ"
    return f"{r:.2f} Ω"


def measure(config: dict, mode: str, red: str | None = None, black: str | None = None,
            component: str | None = None) -> dict:
    """Virtual multimeter reading of the (faulted) circuit."""
    circuit, fault = config["circuit"], config.get("fault")
    if mode not in config.get("meter", []):
        raise ValueError(f"the {mode} meter is not available in this scenario")
    comps = {c["id"]: c for c in circuit["components"]}
    if mode == "voltage":
        if red not in circuit["nodes"] or black not in circuit["nodes"]:
            raise ValueError("place both probes on circuit nodes")
        sol = solve(circuit, fault)
        val = sol["v"][red] - sol["v"][black]
        val = 0.0 if abs(val) < 5e-4 else val
        return {"mode": mode, "red": red, "black": black, "value": round(val, 4), "unit": "V", "display": f"{val:.2f} V"}
    if component not in comps:
        raise ValueError("choose a component")
    if mode == "current":
        sol = solve(circuit, fault)
        ma = abs(sol["i"][component]) * 1000
        ma = 0.0 if ma < 5e-4 else ma
        return {"mode": mode, "component": component, "value": round(ma, 4), "unit": "mA", "display": f"{ma:.2f} mA"}
    if mode == "resistance":
        if comps[component]["type"] == "battery":
            raise ValueError("you cannot measure the resistance of a battery")
        r = _resistance(comps[component], fault)
        r = 0.0 if r <= SHORT_R else r
        return {"mode": mode, "component": component, "value": None if r >= 1e9 else round(r, 3), "unit": "ohm",
                "display": _fmt_ohms(r), "note": "measured with the part isolated and the power off"}
    raise ValueError("unknown meter mode")


def evaluate_fault(config: dict, diagnosis: dict, scenario_skills: list[str]) -> dict:
    fault = config["fault"]
    comp_ok = diagnosis.get("component") == fault["component"]
    kind_ok = comp_ok and diagnosis.get("kind") == fault["kind"]
    value_ok = None
    if kind_ok and fault["kind"] == "wrong_value":
        try:
            est = float(diagnosis.get("value"))
            value_ok = abs(est - fault["actual"]) / fault["actual"] <= config.get("value_tolerance", 0.1)
        except (TypeError, ValueError):
            value_ok = False
    passed = bool(kind_ok and (value_ok is not False))
    if passed:
        failed: list[str] = []
        message = "Correct diagnosis."
    elif not comp_ok:
        failed = list(scenario_skills)
        message = f"{diagnosis.get('component') or 'That part'} is not the faulty component."
    elif not kind_ok:
        failed = [s for s in (KIND_SKILL.get(fault["kind"]), KIND_SKILL.get(diagnosis.get("kind"))) if s in scenario_skills] or list(scenario_skills)
        message = f"Right component, but it is not {diagnosis.get('kind', '').replace('_', ' ')}."
    else:
        failed = [s for s in ("ck_ohms", "ck_value") if s in scenario_skills] or list(scenario_skills)
        message = "Right component and fault type, but the resistance estimate is more than 10% off."
    return {"passed": passed, "n_passed": int(comp_ok) + int(kind_ok) + int(bool(value_ok)) if fault["kind"] == "wrong_value" else int(comp_ok) + int(kind_ok),
            "total": 3 if fault["kind"] == "wrong_value" else 2,
            "failed_skills": failed, "message": message,
            "checks": {"component": comp_ok, "kind": kind_ok, "value": value_ok}, "error": None}


def evaluate_calc(config: dict, answer, scenario_skills: list[str]) -> dict:
    q = config["question"]
    try:
        val = float(answer)
        ok = math.isclose(val, q["answer"], rel_tol=q.get("tolerance", 0.02), abs_tol=1e-9)
    except (TypeError, ValueError):
        ok = False
    return {"passed": ok, "n_passed": int(ok), "total": 1, "failed_skills": [] if ok else list(scenario_skills),
            "message": "Correct." if ok else f"Not quite. Check your working (answer in {q['unit']}).",
            "checks": {"value": ok}, "error": None}
