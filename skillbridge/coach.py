"""AI coach: explains mistakes. It never decides correctness.

The coach receives a structured summary built only from recorded data: skills,
each wrong attempt with the evaluator's verified result, hint usage, and the
author's verified description of the bug. The deterministic evaluator's
verdict is passed as ground truth and the model is told not to re-judge it.

Uses Claude when ANTHROPIC_API_KEY is set and the `anthropic` package is
installed. Otherwise, or on any error, falls back to template feedback built
from the same summary.
"""
from __future__ import annotations

import json
import logging
import os

log = logging.getLogger("skillbridge.coach")

MODEL = os.environ.get("SKILLBRIDGE_COACH_MODEL", "claude-opus-5-5")
TIMEOUT = float(os.environ.get("SKILLBRIDGE_COACH_TIMEOUT", "30"))

SYSTEM = """You are the feedback coach inside SkillBridge, a practice app where learners fix buggy Python or troubleshoot DC circuits.

You receive a JSON summary of one practice scenario. It is built only from recorded actions and a deterministic evaluator.
Rules:
- The field "verified_result" is ground truth from the evaluator. Never contradict it, never re-grade the work, never say an answer is right or wrong unless verified_result says so.
- Explain the mistake pattern you see in "wrong_attempts", linking it to the skill names given. Be specific and refer to the evidence (failing check names, error types, measurements).
- If "finished" is false the learner is still working: do NOT give the fix or the answer. Give one question or one thing to check.
- If "finished" is true you may explain the fix using "verified_bug_description".
- If hints were used, mention briefly how to try the next step before reaching for a hint.
- Write for a high-school learner: plain words, encouraging, no fluff. Keep each field to 1-3 sentences."""

SCHEMA = {
    "type": "object",
    "properties": {
        "headline": {"type": "string", "description": "One short sentence."},
        "what_happened": {"type": "string"},
        "why": {"type": "string", "description": "The underlying concept, tied to the skill."},
        "next_time": {"type": "string", "description": "One concrete habit or check for next time."},
    },
    "required": ["headline", "what_happened", "why", "next_time"],
    "additionalProperties": False,
}


def _describe_result(result: dict) -> str:
    if result.get("error"):
        e = result["error"]
        return f"{e['type']}: {e['message']}" + (f" (line {e['line']})" if e.get("line") else "")
    if "tests" in result:
        failed = [t["name"] + (f" [{t['error']['type']}]" if t.get("error") else "") for t in result["tests"] if not t["passed"]]
        return f"passed {result['n_passed']}/{result['total']} checks" + (f"; failing: {', '.join(failed)}" if failed else "")
    return result.get("message", "")


def build_summary(svc, eid: int) -> dict:
    ep = svc.episode(eid)
    sc = svc.cat.scenarios[ep["scenario"]["id"]]
    finished = ep["status"] in ("solved", "failed")
    wrong = []
    for s in ep["submissions"]:
        if s["passed"]:
            continue
        item = {"attempt": s["attempt_no"], "evaluator": _describe_result(s["result"]),
                "skills_implicated": [ep["skill_names"].get(k, k) for k in s["failed_skills"]]}
        if ep["domain"] == "circuits":
            item["submitted"] = s["payload"]
        wrong.append(item)
    last = ep["submissions"][-1] if ep["submissions"] else None
    summary = {
        "scenario": sc["title"], "domain": ep["domain_name"], "task": sc["prompt"],
        "skills": list(ep["skill_names"].values()), "difficulty": sc["difficulty"],
        "finished": finished, "outcome": ep["status"],
        "attempts": ep["attempts"], "hints_used": ep["hints_used"], "hint_texts_seen": ep["hints"],
        "wrong_attempts": wrong,
        "verified_result": {"passed": bool(last and last["passed"]), "detail": _describe_result(last["result"]) if last else "no attempt"},
        "selection_mode": ep["selection"].get("mode"),
        "worked_example_shown": bool(ep["worked_example"]),
        "transfer_check": bool(ep["transfer_skills"]),
        "active_seconds": ep["active_seconds"],
    }
    if ep["domain"] == "circuits":
        summary["measurements_taken"] = [m.get("display") + " " + (f"{m['red']}->{m['black']}" if m.get("red") else m.get("component", ""))
                                         for m in ep["measurements"]][-15:]
    if finished:
        summary["verified_bug_description"] = sc.get("explanation")
        summary["score"] = ep["score"]
        summary["mastery_changes"] = {ep["skill_names"].get(k, k): v for k, v in (ep["mastery_changes"] or {}).items()}
    return summary


def template_feedback(s: dict) -> dict:
    skills = ", ".join(s["skills"])
    n_wrong = len(s["wrong_attempts"])
    if not s["finished"]:
        first = s["wrong_attempts"][-1] if s["wrong_attempts"] else None
        return {
            "headline": f"Attempt {s['attempts']} did not pass yet. Keep going.",
            "what_happened": f"The evaluator reported: {first['evaluator'].rstrip('.')}." if first else "No graded attempt yet.",
            "why": f"This scenario practises {skills}. Look at which checks fail and what they have in common.",
            "next_time": "Change one thing at a time and re-run, so you can see what each change does.",
            "source": "template",
        }
    if s["outcome"] == "solved":
        head = "Solved on the first try with no hints." if n_wrong == 0 and s["hints_used"] == 0 else \
            f"Solved after {s['attempts']} attempt{'s' if s['attempts'] != 1 else ''}" + (f" and {s['hints_used']} hint{'s' if s['hints_used'] != 1 else ''}." if s["hints_used"] else ".")
    else:
        head = "Not solved this time. Here is what went wrong."
    if n_wrong:
        patterns = sorted({k for w in s["wrong_attempts"] for k in w["skills_implicated"]})
        what = (f"{n_wrong} attempt{'s' if n_wrong != 1 else ''} failed. The first one: {s['wrong_attempts'][0]['evaluator'].rstrip('.')}. "
                f"Those failures point at {', '.join(patterns) or skills}.")
    else:
        what = f"Your first submission passed every check ({s['verified_result']['detail'].rstrip('.')})."
    why = s.get("verified_bug_description") or f"This scenario practises {skills}."
    if s["hints_used"] > 1:
        nxt = "Next time, before asking for a hint, write down what you expect the code or circuit to do and test that one prediction."
    elif n_wrong >= 2:
        nxt = "Next time, run a quick test before submitting, especially on edge cases like empty input or boundary values."
    elif s["outcome"] != "solved":
        nxt = "Read the worked solution, then try a similar scenario. The engine will give you an easier one for this skill."
    else:
        nxt = "Nice work. The next scenario will push the difficulty up a little."
    return {"headline": head, "what_happened": what, "why": why, "next_time": nxt, "source": "template"}


def _claude(summary: dict) -> dict:
    import anthropic   # optional dependency
    client = anthropic.Anthropic(timeout=TIMEOUT, max_retries=1)
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=2000,
        system=SYSTEM,
        messages=[{"role": "user", "content": "Scenario summary:\n" + json.dumps(summary, indent=2)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    )
    if resp.stop_reason == "refusal":
        raise RuntimeError("model declined")
    text = "".join(b.text for b in resp.content if b.type == "text")
    data = json.loads(text)
    return {k: str(data[k]) for k in ("headline", "what_happened", "why", "next_time")}


def llm_available() -> bool:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return False
    try:
        import anthropic  # noqa: F401
        return True
    except ImportError:
        return False


def feedback(summary: dict) -> dict:
    if llm_available():
        try:
            fb = _claude(summary)
            fb["source"] = "claude"
            fb["model"] = MODEL
            return fb
        except Exception as exc:   # network, auth, rate limit, refusal, bad JSON: always fall back
            log.warning("coach LLM call failed, using template: %s", exc)
            fb = template_feedback(summary)
            fb["fallback_reason"] = type(exc).__name__
            return fb
    fb = template_feedback(summary)
    fb["fallback_reason"] = "no ANTHROPIC_API_KEY" if not os.environ.get("ANTHROPIC_API_KEY") else "anthropic package not installed"
    return fb
