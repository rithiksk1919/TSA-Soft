"""The coach explains mistakes. It never decides correctness.

Everything goes through one function:

    get_feedback(actions, result, context)

    actions  the learner's recorded actions for one scenario, oldest first.
             Each is {"type", "payload", "ts"}: edit, run, measure, hint, submit, ...
    result   the evaluator's verified verdict on the latest submission, plus
             "finished", "outcome" ("solved" / "failed" / "active") and "score".
    context  facts about the scenario: title, skill names, and (only once the
             scenario is over) the author's verified description of the bug.

It returns {"headline", "what_happened", "why", "next_time", "source"}.

Right now the wording comes from templates filled in with the recorded numbers.
To use a real AI model later, replace the body of get_feedback and keep the
same inputs and outputs. Nothing else in the app needs to change.
"""


def plural(count, word):
    if count == 1:
        return str(count) + " " + word
    return str(count) + " " + word + "s"


def join_names(names):
    if len(names) == 0:
        return ""
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


def describe_result(result):
    """One factual sentence about what the evaluator reported."""
    error = result.get("error")
    if error:
        text = error["type"] + ": " + error["message"]
        if error.get("line"):
            text = text + " (line " + str(error["line"]) + ")"
        return text
    if "tests" in result:
        failing = []
        for test in result["tests"]:
            if not test["passed"]:
                failing.append(test["name"])
        text = str(result["n_passed"]) + " of " + str(result["total"]) + " checks passed"
        if failing:
            text = text + "; still failing: " + ", ".join(failing)
        return text
    return result.get("message", "")


def count_actions(actions, kind):
    total = 0
    for action in actions:
        if action["type"] == kind:
            total = total + 1
    return total


def wrong_submissions(actions):
    wrong = []
    for action in actions:
        if action["type"] == "submit":
            if not action["payload"].get("passed"):
                wrong.append(action)
    return wrong


def skills_behind(wrong, context):
    names = context.get("skill_names", {})
    found = []
    for action in wrong:
        for skill_id in action["payload"].get("failed_skills", []):
            name = names.get(skill_id, skill_id)
            if name not in found:
                found.append(name)
    found.sort()
    if not found:
        return list(context.get("skills", []))
    return found


def feedback(headline, what, why, next_time):
    return {"headline": headline, "what_happened": what, "why": why, "next_time": next_time, "source": "coach"}


def get_feedback(actions, result, context=None):
    if context is None:
        context = {}
    if context.get("question") is not None:
        return reading_desk_reply(actions, context)

    attempts = count_actions(actions, "submit")
    hints = count_actions(actions, "hint")
    wrong = wrong_submissions(actions)
    implicated = skills_behind(wrong, context)
    topic = join_names(list(context.get("skills", [])))
    if not topic:
        topic = "this skill"
    verdict = describe_result(result).rstrip(".")

    if not result.get("finished"):
        return feedback_while_working(attempts, hints, implicated, verdict, result, topic)
    return feedback_when_done(attempts, hints, wrong, implicated, verdict, result, context, topic)


def feedback_while_working(attempts, hints, implicated, verdict, result, topic):
    """Still working: a nudge, never the answer."""
    if attempts == 0:
        return feedback("Nothing has been graded yet.",
                        "You have not submitted an attempt for this one.",
                        "This scenario is about " + topic + ".",
                        "Run it once on the sample first, so you can see what it really does.")

    what = "Attempt " + str(attempts) + " did not pass. The evaluator reported: " + verdict + "."
    if implicated:
        what = what + " Those checks point at " + join_names(implicated) + "."

    error = result.get("error")
    if error and error["type"] in ("IndexError", "KeyError"):
        why = "That error means the code reached for something that is not there, so check the very start and the very end of the data."
    elif error:
        why = "The program stopped with a " + error["type"] + " before it could finish, so fix the crash first, then look at the answers."
    else:
        why = "Work out what the failing checks have in common. That is usually the idea behind " + topic + "."

    if hints >= 2:
        next_time = "You have used a couple of hints already. Before the next one, say what you expect to happen and test just that."
    elif attempts >= 2:
        next_time = "Change one thing at a time and run again, so you can tell which change helped."
    else:
        next_time = "Try your own test case on the sample before you submit again."
    return feedback("Not yet: attempt " + str(attempts) + " needs another look.", what, why, next_time)


def feedback_when_done(attempts, hints, wrong, implicated, verdict, result, context, topic):
    solved = result.get("outcome") == "solved"
    if solved:
        if not wrong and hints == 0:
            headline = "Solved on the first try with no hints."
        elif hints == 0:
            headline = "Solved on attempt " + str(attempts) + " with no hints."
        else:
            headline = "Solved on attempt " + str(attempts) + " using " + plural(hints, "hint") + "."
        if wrong:
            what = plural(len(wrong), "earlier attempt") + " did not pass before you got there. The misses were about " + join_names(implicated) + "."
        else:
            what = "Every check passed on your first submission (" + verdict + ")."
        if result.get("score") is not None:
            what = what + " That scores " + format(result["score"], ".2f") + " for this scenario."
    else:
        headline = "Not solved this time, and that is useful to know."
        what = "You used " + plural(attempts, "attempt")
        if hints:
            what = what + " and " + plural(hints, "hint")
        what = what + ". The last result: " + verdict + "."

    why = context.get("explanation")
    if not why:
        why = "This scenario practises " + topic + "."

    if not solved:
        next_time = "Read the worked example, then try the next scenario. The engine will aim a little lower for this skill so it can build back up."
    elif hints >= 2:
        next_time = "Next time, write down what you expect to happen and test that one prediction before you ask for a hint."
    elif len(wrong) >= 2:
        next_time = "Next time, run one quick edge case (empty input, zero, the last item) before you submit."
    elif hints == 1:
        next_time = "One hint is fine. Say what it told you in your own words so the idea sticks."
    else:
        next_time = "Good work. The next scenario will sit a little higher."
    return feedback(headline, what, why, next_time)


WHERE = {
    "read": "reading the problem",
    "check": "checking the steps",
    "why": "working out why a step is wrong",
    "fix": "fixing that step",
    "after": "finishing the solution",
}


def reading_desk_reply(actions, context):
    """A free question the written lines did not cover. Built only from this session; never the answer."""
    hints = count_actions(actions, "hint")
    misses = len(wrong_submissions(actions))
    where = WHERE.get(context.get("phase"), "working through it")
    parts = ["I'm not sure I follow that one, but here is where we are: you're " + where + "."]
    if hints == 0 and misses == 0:
        parts.append("So far there have been no hints and no missed steps. Read each line against the sketch, one at a time.")
    elif misses > 0:
        parts.append("You've called " + plural(misses, "step") + " the wrong way so far, so slow down and compare each number with the sketch.")
    if hints > 0:
        parts.append("You've used " + plural(hints, "hint") + ".")
    parts.append("Say \"hint\" for a nudge, or ask about a word in the problem.")
    return {"reply": " ".join(parts), "source": "coach"}
