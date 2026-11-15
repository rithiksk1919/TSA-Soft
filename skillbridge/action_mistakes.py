"""What did I get wrong? Reads the Action Log extension's saved actions (data/action-log/*.jsonl)
and lists the mistakes in them, oldest first.

A mistake is:
  - a graded answer the server marked wrong: SkillBridge code submissions ("passed": false),
    Bug Hoops shots ("made": false), warm-up game and diagnostic answers ("correct": false),
    and the same fields in any other site's responses;
  - a message the page showed that says the answer was wrong ("incorrect", "not quite", "try again"...).
  - on AI chats (ChatGPT and others), an arithmetic question the assistant asked ("What is 2 + 2?")
    answered with the wrong number in the next message you sent; the script works the sum out.
Hints taken and problems given up on are listed too, since they mark where the learner got stuck.

usage: python scripts/mistakes.py [--since today|2h|30m|YYYY-MM-DD] [--dir data/action-log] [--json]
The school hub shows the same list in its "Your mistakes" panel (GET /api/mistakes).
"""
from __future__ import annotations

import argparse
import ast
import datetime as dt
import operator
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WRONG_KEYS = ("passed", "correct", "made", "is_correct", "isCorrect", "right")
WRONG_TEXT = re.compile(r"\b(incorrect|wrong answer|that'?s wrong|you'?re wrong|is wrong|not (quite|correct|right)|that'?s not (it|right|correct)|you missed|rewriting mathematics|parallel universe)\b", re.I)
SITE_ERROR = re.compile(r"something went wrong|went wrong on our end|network error|please try again later", re.I)
SAYS = ("explanation", "feedback", "message", "why", "reason", "hint", "expected", "answer", "correct_answer", "key", "fix")


def parse_since(text: str | None) -> float:
    if not text:
        return 0.0
    now = dt.datetime.now()
    if text == "today":
        return dt.datetime.combine(now.date(), dt.time()).timestamp() * 1000
    m = re.fullmatch(r"(\d+)\s*([mhd])", text)
    if m:
        n, unit = int(m[1]), m[2]
        delta = {"m": dt.timedelta(minutes=n), "h": dt.timedelta(hours=n), "d": dt.timedelta(days=n)}[unit]
        return (now - delta).timestamp() * 1000
    return dt.datetime.fromisoformat(text).timestamp() * 1000


def load(folder: Path, since: float) -> list[dict]:
    events = []
    for f in sorted(folder.glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            if isinstance(ev, dict) and ev.get("t", 0) >= since:
                events.append(ev)
    events.sort(key=lambda e: e["t"])
    return events


def wrong_flags(obj, path=""):
    """Every place in a JSON response that marks an answer wrong, with the object around it."""
    found = []
    if isinstance(obj, dict):
        for k in WRONG_KEYS:
            if obj.get(k) is False:
                found.append((path + "." + k if path else k, obj))
                break
        for k, v in obj.items():
            found += wrong_flags(v, path + "." + k if path else k)
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            found += wrong_flags(v, f"{path}[{i}]")
    return found


def short(value, n=160) -> str:
    if value is None:
        return ""
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def explain(obj: dict) -> str:
    parts = []
    for k in SAYS:
        if obj.get(k) not in (None, "", [], {}):
            parts.append(f"{k}: {short(obj[k])}")
    for k in ("skill", "skill_name", "title", "question", "prompt", "scenario", "chosen_line", "choice", "failed_skills"):
        if obj.get(k) not in (None, "", [], {}):
            parts.append(f"{k}: {short(obj[k], 100)}")
    return "; ".join(parts[:6])


# ---- arithmetic questions in chats -------------------------------------------------------------
OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
       ast.Pow: operator.pow, ast.USub: operator.neg, ast.UAdd: operator.pos}
EXPR = re.compile(r"(?<![\w.])\(?-?\d+(?:\.\d+)?(?:\s*[-+*/×÷x^]\s*\(?-?\d+(?:\.\d+)?\)?)+")


def calc(text: str):
    """The value of a plain arithmetic expression, or None. Only numbers and + - * / ^ ( )."""
    expr = text.replace("×", "*").replace("÷", "/").replace("^", "**")
    expr = re.sub(r"(?<=\d)\s*x\s*(?=\d)", "*", expr)

    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.BinOp) and type(node.op) in OPS:
            right = ev(node.right)
            if isinstance(node.op, ast.Pow) and abs(right) > 12:
                raise ValueError("too big")
            return OPS[type(node.op)](ev(node.left), right)
        if isinstance(node, ast.UnaryOp) and type(node.op) in OPS:
            return OPS[type(node.op)](ev(node.operand))
        raise ValueError("not arithmetic")

    try:
        return ev(ast.parse(expr.strip(), mode="eval"))
    except (ValueError, SyntaxError, ZeroDivisionError, TypeError):
        return None


def asked_sum(reply: str):
    """The arithmetic question at the end of an assistant's reply: (expression, value) or None."""
    questions = [q for q in re.split(r"(?<=[?])", reply) if "?" in q]
    for q in reversed(questions or [reply]):
        found = EXPR.findall(q)
        if found:
            value = calc(found[-1])
            if value is not None:
                return found[-1].strip(), value
    return None


def number(text: str):
    eq = re.fullmatch(r"\s*[-+*/×÷x^().\d\s]+=\s*(-?\d+(?:\.\d+)?)\s*[.!]?\s*", text)
    if eq:
        return float(eq[1])
    m = re.fullmatch(r"\s*(?:it'?s|its|the answer is|answer:|=)?\s*(-?\d+(?:\.\d+)?)\s*[.!]?\s*", text, re.I)
    return float(m[1]) if m else None


def chat_turns(response) -> list[tuple[float, str, str]]:
    """(time, role, text) for each message in a ChatGPT conversation response, in conversation order."""
    turns = []

    def walk(o):
        if isinstance(o, dict):
            msg = o.get("message") if isinstance(o.get("message"), dict) else o
            if isinstance(msg.get("author"), dict) and isinstance(msg.get("content"), dict):
                role = (msg.get("author") or {}).get("role")
                content = msg.get("content") or {}
                parts = content.get("parts") if isinstance(content, dict) else None
                if role in ("user", "assistant") and isinstance(parts, list):
                    text = " ".join(x for x in parts if isinstance(x, str)).strip()
                    if text:
                        turns.append((msg.get("create_time") or 0, role, text))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(response)
    # Keep the conversation's own order: the learner's computer and the site can disagree on
    # the time, so sorting by timestamps can put an answer before its question.
    return turns


def chat_mistakes(turns, page: str) -> list[dict]:
    out = []
    for i in range(len(turns) - 1):
        t, role, text = turns[i]
        if role != "assistant":
            continue
        q = asked_sum(text)
        nxt = turns[i + 1]
        if not q or nxt[1] != "user":
            continue
        given = number(nxt[2])
        if given is not None and abs(given - q[1]) > 1e-9:
            shown = int(q[1]) if float(q[1]).is_integer() else round(q[1], 4)
            sentence = next((s.strip() for s in reversed(re.split(r"(?<=[.!?])\s+", text)) if q[0] in s), q[0])
            when = dt.datetime.fromtimestamp(nxt[0]).strftime("%Y-%m-%d %H:%M:%S") if nxt[0] else ""
            out.append({"when": when, "page": page, "kind": "wrong answer", "what": f"Asked “{short(sentence, 120)}”",
                        "answered": nxt[2].strip(), "detail": f"{q[0]} = {shown}", "topic": "maths"})
    return out


# Requests that aren't answers being graded: analytics, feature flags, experiments, telemetry.
NOT_GRADING = re.compile(r"(//ab\.|statsig|analytics|telemetry|segment|sentry|amplitude|mixpanel|datadog|/initialize|"
                         r"feature|experiment|/flags|/config|/rgstr|/log_event|/events|/track|/collect|/metrics)", re.I)
SETTINGS_PATH = re.compile(r"(dynamic_configs|feature_gates|gates|experiments|layer_configs|flags|settings|config)", re.I)
LIBRARY = re.compile(r"^https?://(127\.0\.0\.1|localhost)(:\d+)?/library", re.I)


def from_mistakes_panel(ev: dict) -> bool:
    """SkillBridge's own "Your mistakes" panel, which older extension versions recorded: reading
    it back would list every mistake again, over and over."""
    target = (ev.get("detail") or {}).get("target") if isinstance(ev.get("detail"), dict) else None
    if isinstance(target, dict):
        if target.get("id") in ("mistakes-list", "mistakes-note") or "mk-" in str(target.get("class", "")) or "mistakes" in str(target.get("class", "")):
            return True
    if LIBRARY.match(str(ev.get("url", ""))):
        return True   # the library's flashcards and reading desk review mistakes you already have
    return bool(re.match(r"(Message|Alert|Dialog): (Wrong answer|Marked wrong|Took a hint|Gave up) ", str(ev.get("summary", ""))))


def find(events: list[dict]) -> list[dict]:
    out = []
    for ev in events:
        d = ev.get("detail")
        if ev.get("type") == "net" and isinstance(d, dict) and "/backend-api/conversation" in str(d.get("url", "")) \
                and isinstance(d.get("response"), dict):
            title = d["response"].get("title") or ev.get("page") or ""
            out += chat_mistakes(chat_turns(d["response"]), title)
    asked = {}      # page -> (question text, expression, value)
    typed = {}      # page -> last text typed into a box
    for ev in events:
        where = ev.get("tab") or ev.get("url", "")
        d0 = ev.get("detail") if isinstance(ev.get("detail"), dict) else {}
        if ev.get("type") == "ui" and d0.get("role") == "assistant":
            q = asked_sum(d0.get("text", ""))
            if q:
                text = d0.get("text", "")
                sentence = next((s.strip() for s in reversed(re.split(r"(?<=[.!?])\s+", text)) if q[0] in s), q[0])
                asked[where] = (sentence, q[0], q[1])
        elif ev.get("type") == "input" and str(ev.get("summary", "")).startswith("Typed into"):
            typed[where] = str(d0.get("value", ""))
        elif ev.get("type") == "key" and d0.get("key") == "Enter" and where in asked and where in typed:
            given = number(typed[where])
            if given is not None:
                question, expr, value = asked.pop(where)
                if abs(given - value) > 1e-9:
                    when = dt.datetime.fromtimestamp(ev["t"] / 1000).strftime("%Y-%m-%d %H:%M:%S")
                    shown = int(value) if float(value).is_integer() else round(value, 4)
                    out.append({"when": when, "page": ev.get("page") or ev.get("url", ""), "kind": "wrong answer",
                                "what": f"Asked “{short(question, 120)}”", "answered": typed[where].strip(),
                                "detail": f"{expr} = {shown}", "topic": "maths"})
            typed.pop(where, None)
    for ev in events:
        d = ev.get("detail") or {}
        when = dt.datetime.fromtimestamp(ev["t"] / 1000).strftime("%Y-%m-%d %H:%M:%S")
        page = ev.get("page") or ev.get("url", "")
        if ev.get("type") == "net" and isinstance(d, dict):
            url = str(d.get("url", ""))
            resp = d.get("response")
            # SkillBridge: hints and giving up mark where the learner got stuck
            if re.search(r"/api/episodes/\d+/hint", url) and d.get("status") == 200:
                out.append({"when": when, "page": page, "kind": "hint", "what": "Took a hint", "detail": explain(resp) if isinstance(resp, dict) else ""})
            if re.search(r"/api/episodes/\d+/give_up", url):
                out.append({"when": when, "page": page, "kind": "gave up", "what": "Gave up on the problem", "detail": explain(resp) if isinstance(resp, dict) else ""})
            if NOT_GRADING.search(url):
                continue
            for where, obj in wrong_flags(resp):
                if SETTINGS_PATH.search(where):
                    continue
                answered = d.get("request")
                out.append({
                    "when": when, "page": page, "kind": "wrong answer",
                    "what": f"{d.get('method', '')} {url} marked {where} = false",
                    "answered": short(answered, 200),
                    "detail": explain(obj),
                })
        elif ev.get("type") == "ui" and WRONG_TEXT.search(ev.get("summary", "")) and not SITE_ERROR.search(ev.get("summary", "")) \
                and not from_mistakes_panel(ev):
            out.append({"when": when, "page": page, "kind": "told wrong", "what": ev["summary"], "detail": ""})
    out.sort(key=lambda m: m["when"])
    last_wrong = {}
    kept = []
    for m in out:
        if m["kind"] == "wrong answer":
            last_wrong[m["page"]] = m["when"]
        if m["kind"] == "told wrong" and m["what"].startswith("Assistant said") and m["page"] in last_wrong:
            gap = dt.datetime.fromisoformat(m["when"]) - dt.datetime.fromisoformat(last_wrong[m["page"]])
            if dt.timedelta(0) <= gap <= dt.timedelta(seconds=90):
                continue
        kept.append(m)
    out = kept
    # one response often marks the same answer at several depths: keep the first per request
    seen = set()
    unique = []
    for m in out:
        if m["kind"] == "wrong answer" and m["what"].startswith("Asked"):
            key = ("chat", m["what"], m.get("answered"))
        else:
            key = (m["when"], m["kind"], m["what"].split(" marked ")[0])
        if key in seen:
            continue
        seen.add(key)
        unique.append(m)
    return unique


def summary(since: str | None = "today", limit: int = 60, folder: Path | None = None) -> dict:
    """The mistakes for the hub's panel: newest first, with how many actions were read."""
    folder = folder or ROOT / "data" / "action-log"
    if not folder.exists():
        return {"has_log": False, "actions": 0, "mistakes": []}
    events = load(folder, parse_since(since))
    found = find(events)
    found.reverse()
    return {"has_log": True, "actions": len(events), "mistakes": found[:limit], "total": len(found)}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--since", help="today, 2h, 30m, 3d or a date (YYYY-MM-DD)")
    ap.add_argument("--dir", default=str(ROOT / "data" / "action-log"))
    ap.add_argument("--json", action="store_true", help="print the mistakes as JSON")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    folder = Path(a.dir)
    if not folder.exists():
        print(f"No saved actions yet ({folder} does not exist). Use the Action Log extension with the SkillBridge app running.")
        return 0
    events = load(folder, parse_since(a.since))
    mistakes = find(events)
    if a.json:
        print(json.dumps(mistakes, indent=2, ensure_ascii=False))
        return 0
    print(f"{len(events)} school-related actions read, {len(mistakes)} mistakes and sticking points found.\n")
    for m in mistakes:
        print(f"{m['when']}  [{m['kind']}]  {m['page']}")
        print(f"    {m['what']}")
        if m.get("answered"):
            print(f"    you sent: {m['answered']}")
        if m.get("detail"):
            print(f"    {m['detail']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
