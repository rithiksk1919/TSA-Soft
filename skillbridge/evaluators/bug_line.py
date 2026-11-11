"""Grades a "find the line with the bug" shot (the Gym's Bug Hoops game).

The answer key lives only on the server. The browser sends the line number it
picked, and this function compares it with the key. Nothing else decides
whether a shot went in.
"""


def evaluate(config, chosen_line, scenario_skills):
    lines = config["lines"]
    answer = config["answer"]

    try:
        chosen = int(chosen_line)
    except (TypeError, ValueError):
        chosen = -1

    if chosen < 0 or chosen >= len(lines):
        return {
            "passed": False,
            "chosen_line": chosen,
            "correct_line": answer,
            "failed_skills": list(scenario_skills),
            "message": "That is not a line in this snippet.",
        }

    passed = chosen == answer
    if passed:
        failed_skills = []
        message = "Correct: line " + str(chosen + 1) + " has the bug."
    else:
        failed_skills = list(scenario_skills)
        message = "Line " + str(chosen + 1) + " is fine. The bug is on line " + str(answer + 1) + "."

    return {
        "passed": passed,
        "chosen_line": chosen,
        "correct_line": answer,
        "failed_skills": failed_skills,
        "message": message,
    }
