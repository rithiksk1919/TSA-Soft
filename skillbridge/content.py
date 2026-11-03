"""Loads skills, scenarios and diagnostics from the JSON files in content/.

Scenario file format (one JSON file per scenario):
  id, domain, title, skills[], difficulty (0..1), surface_form, scaffold (0..2),
  prompt, starter, hints[] (ordered), explanation (author's note on the bug,
  given to the coach as verified ground truth), evaluator {type, ...}, solution
  (hidden until the scenario ends).
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .engine import Scenario as EngineScenario, Skill as EngineSkill

ROOT = Path(__file__).resolve().parent.parent
CONTENT_DIR = ROOT / "content"
REQUIRED = ("id", "domain", "title", "skills", "difficulty", "surface_form", "prompt", "hints", "evaluator")
EVALUATOR_TYPES = {"python_tests", "circuit_fault", "circuit_calc"}


class ContentError(ValueError):
    pass


@dataclass
class Catalog:
    domains: list[dict]
    skills: list[dict]
    scenarios: dict[str, dict]
    diagnostics: dict

    def skill(self, sid: str) -> dict:
        return next(s for s in self.skills if s["id"] == sid)

    def domain(self, did: str) -> dict:
        return next(d for d in self.domains if d["id"] == did)

    def skills_in(self, domain: str) -> list[dict]:
        return [s for s in self.skills if s["domain"] == domain]

    def scenarios_in(self, domain: str) -> list[dict]:
        return sorted((s for s in self.scenarios.values() if s["domain"] == domain), key=lambda s: s["id"])

    def engine_skills(self, domain: str) -> list[EngineSkill]:
        return [EngineSkill(s["id"], s["name"], s["domain"], tuple(s.get("prereqs", []))) for s in self.skills_in(domain)]

    def engine_scenario(self, sc: dict) -> EngineScenario:
        return EngineScenario(sc["id"], sc["domain"], tuple(sc["skills"]), float(sc["difficulty"]),
                              sc["surface_form"], int(sc.get("scaffold", 0)), sc["title"])

    def engine_catalog(self, domain: str) -> list[EngineScenario]:
        return [self.engine_scenario(s) for s in self.scenarios_in(domain)]


def validate_scenario(sc: dict, skill_ids: set[str], domains: set[str]) -> None:
    missing = [k for k in REQUIRED if k not in sc]
    if missing:
        raise ContentError(f"{sc.get('id', '?')}: missing fields {missing}")
    if sc["domain"] not in domains:
        raise ContentError(f"{sc['id']}: unknown domain {sc['domain']}")
    if not sc["skills"] or any(s not in skill_ids for s in sc["skills"]):
        raise ContentError(f"{sc['id']}: unknown or empty skill tags {sc['skills']}")
    if not 0.0 <= float(sc["difficulty"]) <= 1.0:
        raise ContentError(f"{sc['id']}: difficulty must be in [0, 1]")
    if not isinstance(sc["hints"], list) or not sc["hints"]:
        raise ContentError(f"{sc['id']}: hints must be a non-empty ordered list")
    if sc["evaluator"].get("type") not in EVALUATOR_TYPES:
        raise ContentError(f"{sc['id']}: unknown evaluator type")


@lru_cache(maxsize=1)
def load(content_dir: str | None = None) -> Catalog:
    base = Path(content_dir) if content_dir else CONTENT_DIR
    meta = json.loads((base / "skills.json").read_text())
    skill_ids = {s["id"] for s in meta["skills"]}
    domains = {d["id"] for d in meta["domains"]}
    for s in meta["skills"]:
        for p in s.get("prereqs", []):
            if p not in skill_ids:
                raise ContentError(f"skill {s['id']}: unknown prerequisite {p}")
    scenarios = {}
    for f in sorted((base / "scenarios").glob("*/*.json")):
        sc = json.loads(f.read_text())
        validate_scenario(sc, skill_ids, domains)
        if sc["id"] in scenarios:
            raise ContentError(f"duplicate scenario id {sc['id']}")
        scenarios[sc["id"]] = sc
    diagnostics = json.loads((base / "diagnostics.json").read_text())
    return Catalog(meta["domains"], meta["skills"], scenarios, diagnostics)


def public_scenario(sc: dict) -> dict:
    """What the browser may see before the scenario is finished."""
    out = {k: copy.deepcopy(v) for k, v in sc.items() if k not in ("solution", "explanation", "evaluator", "hints")}
    out["hint_count"] = len(sc["hints"])
    ev = sc["evaluator"]
    pub = {"type": ev["type"]}
    if ev["type"] == "python_tests":
        pub["entry"] = ev.get("entry")
        pub["sample"] = ev.get("sample", "")
        pub["tests"] = [
            ({"name": t["name"], "visible": True, "input": t.get("code") or f"{ev.get('entry')}{tuple(t.get('args', []))!r}".replace(",)", ")"),
              "expected": t["expected"]} if t.get("visible") else {"name": t["name"], "visible": False})
            for t in ev["tests"]
        ]
    else:
        pub["circuit"] = copy.deepcopy(ev["circuit"])
        pub["meter"] = list(ev.get("meter", []))
        if ev["type"] == "circuit_calc":
            pub["question"] = {k: v for k, v in ev["question"].items() if k in ("text", "unit")}
    out["evaluator"] = pub
    return out


def public_diagnostic(cat: Catalog, domain: str) -> list[dict]:
    return [{k: v for k, v in q.items() if k != "answer"} for q in cat.diagnostics.get(domain, [])]
