"""Classroom lessons. One data file per skill in content/lessons/<skill_id>.json.

A lesson has three stations:
    chalkboard  code with a step-by-step trace and the memory (global and local names) at each step
    textbook    two pages, each with paragraphs, a nested-box diagram and a key term
    listen      a transcript the browser can read aloud

A skill without its own file gets a simple lesson built from its worked example in
content/skills.json, so adding a skill always adds a lesson.
"""
import json
from pathlib import Path

LESSON_DIR = Path(__file__).resolve().parent.parent / "content" / "lessons"


def load_lesson(catalog, skill_id):
    skill = catalog.skill(skill_id)
    path = LESSON_DIR / (skill_id + ".json")
    if path.is_file():
        lesson = json.loads(path.read_text(encoding="utf-8"))
        lesson["generated"] = False
    else:
        lesson = lesson_from_worked_example(skill)
    lesson["skill_name"] = skill["name"]
    lesson["domain"] = skill["domain"]
    return lesson


def lesson_from_worked_example(skill):
    worked = skill["worked_example"]
    code = worked["before"].split("\n")
    steps = []
    for text in worked["steps"]:
        steps.append({"line": -1, "say": text, "memory": {"global": {}, "local": {}}})
    kicker = "Lesson · " + skill["name"]
    first_page = {
        "kicker": kicker,
        "title": worked["title"],
        "paragraphs": [skill["description"], worked["steps"][0]],
        "diagram": {"outer": {"label": "Before", "lines": worked["before"].split("\n")},
                    "inner": {"label": "After", "lines": worked["after"].split("\n")}},
        "key_term": {"term": skill["name"], "definition": skill["description"]},
    }
    second_page = {
        "kicker": kicker,
        "title": "Step by step",
        "paragraphs": [" ".join(worked["steps"][1:3]), " ".join(worked["steps"][3:])],
        "diagram": {"outer": {"label": "Check", "lines": [worked["steps"][-1]]},
                    "inner": {"label": "Fixed", "lines": worked["after"].split("\n")}},
        "key_term": {"term": skill["name"], "definition": skill["description"]},
    }
    return {
        "skill": skill["id"],
        "chapter": 0,
        "title": worked["title"],
        "generated": True,
        "chalkboard": {"title": worked["title"], "local_label": "", "code": code, "steps": steps},
        "textbook": {"pages": [first_page, second_page]},
        "listen": {"transcript": [skill["description"]] + list(worked["steps"])},
    }
