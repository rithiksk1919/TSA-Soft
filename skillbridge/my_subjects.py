"""Your own subjects: folders of files uploaded in the library, each shown as a book on the shelf.

Each subject is a folder under data/uploads/ (kept out of git). Its files keep the folders they
were uploaded in, and the first level of folders inside a subject become its chapters
("Unit 3", "Notes"...). A small .subject.json holds the subject's name and book colour.

Mistakes from the Action Log extension (action_mistakes.py) are filed into the subject they
belong to: each mistake gets a topic (maths, biology, English...), and goes to the subject whose
name names that topic, or whose name appears in the mistake itself.
"""
from __future__ import annotations

import json
import mimetypes
import re
import shutil
import time
import unicodedata
from pathlib import Path

from . import action_mistakes, organizer
from .content import ROOT

UPLOAD_DIR = ROOT / "data" / "uploads"
META = ".subject.json"
MAX_FILE = 200 * 1024 * 1024          # 200 MB per file
COLORS = ["#2F5D50", "#7B3F36", "#2D4A6E", "#B8964A", "#5B4A6B", "#4F6B45", "#8A6446", "#3E5871", "#9B5A3C", "#46636E"]

# Files that open inside the library. Everything else downloads. Web pages, SVG and scripts are
# never shown inline, so an uploaded file cannot run code inside the app.
INLINE = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".txt", ".md", ".csv", ".mp3", ".wav", ".m4a",
          ".ogg", ".mp4", ".webm", ".mov", ".py", ".java", ".c", ".cpp", ".json"}
TEXTLIKE = {".txt", ".md", ".csv", ".py", ".java", ".c", ".cpp", ".json"}

# Topics, and the words that name them in a subject's name or a mistake.
TOPICS = {
    "maths": ["math", "maths", "mathematics", "algebra", "geometry", "calculus", "precalculus", "pre-calc", "statistics",
              "stats", "trigonometry", "trig", "arithmetic", "kumon", "equation", "fraction", "derivative", "integral",
              "polynomial", "quadratic"],
    "biology": ["biology", "bio", "cell", "photosynthesis", "genetics", "evolution", "anatomy", "ecology"],
    "chemistry": ["chemistry", "chem", "molecule", "atom", "periodic table", "chemical", "reaction", "stoichiometry"],
    "physics": ["physics", "velocity", "acceleration", "force", "newton", "energy", "momentum", "circuit", "ohm"],
    "science": ["science", "experiment", "hypothesis", "lab report"],
    "english": ["english", "ela", "language arts", "literature", "reading", "writing", "essay", "grammar", "vocabulary",
                "poem", "novel", "thesis"],
    "history": ["history", "social studies", "government", "civics", "economics", "geography", "war", "revolution"],
    "languages": ["spanish", "french", "german", "chinese", "mandarin", "japanese", "latin", "italian", "korean", "conjugate"],
    "computing": ["computer science", "comp sci", "coding", "programming", "python", "java", "javascript", "algorithm",
                  "debugging", "loop", "syntax error"],
}


class SubjectError(ValueError):
    pass


def _words(text: str) -> str:
    return " " + re.sub(r"[^a-z0-9+]+", " ", text.lower()) + " "


def topic_of(text: str) -> str | None:
    """The topic a piece of text is about, by the first topic word in it (subject names are short)."""
    t = _words(text)
    best = None
    for topic, words in TOPICS.items():
        for w in words:
            i = t.find(" " + w + " ")
            if i >= 0 and (best is None or i < best[0]):
                best = (i, topic)
    return best[1] if best else None


def slug(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:48] or "subject"


def _clean_part(part: str) -> str:
    part = unicodedata.normalize("NFC", part).strip()
    part = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", part)
    if part in ("", ".", "..") or part.startswith("."):
        raise SubjectError("That file or folder name can't be used: " + repr(part))
    return part[:120]


def safe_rel(rel: str) -> Path:
    parts = [p for p in re.split(r"[\\/]+", rel) if p]
    if not parts or len(parts) > 12:
        raise SubjectError("A file needs a name, and at most 12 folders deep.")
    return Path(*[_clean_part(p) for p in parts])


def _subject_dir(sid: str) -> Path:
    if not re.fullmatch(r"[a-z0-9-]{1,48}", sid or ""):
        raise SubjectError("Unknown subject.")
    d = UPLOAD_DIR / sid
    if not (d / META).exists():
        raise SubjectError("Unknown subject.")
    return d


def subject_dir(sid: str) -> Path:
    return _subject_dir(sid)


def _meta(d: Path) -> dict:
    try:
        return json.loads((d / META).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"name": d.name}


def create(name: str) -> dict:
    name = re.sub(r"\s+", " ", str(name or "")).strip()[:60]
    if not name:
        raise SubjectError("Give the subject a name.")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    for d in UPLOAD_DIR.iterdir():
        if d.is_dir() and (d / META).exists() and _meta(d).get("name", "").lower() == name.lower():
            return {"id": d.name, "name": _meta(d)["name"], "created": False}
    base = slug(name)
    sid = base
    n = 2
    while (UPLOAD_DIR / sid).exists():
        sid = f"{base}-{n}"
        n += 1
    count = sum(1 for d in UPLOAD_DIR.iterdir() if (d / META).exists())
    d = UPLOAD_DIR / sid
    d.mkdir()
    (d / META).write_text(json.dumps({"name": name, "color": COLORS[count % len(COLORS)], "created": time.time()}), encoding="utf-8")
    return {"id": sid, "name": name, "created": True}


def rename(sid: str, name: str) -> dict:
    d = _subject_dir(sid)
    name = re.sub(r"\s+", " ", str(name or "")).strip()[:60]
    if not name:
        raise SubjectError("Give the subject a name.")
    meta = _meta(d)
    meta["name"] = name
    (d / META).write_text(json.dumps(meta), encoding="utf-8")
    return {"id": sid, "name": name}


def remove(sid: str) -> dict:
    d = _subject_dir(sid)
    shutil.rmtree(d)
    return {"removed": sid}


def file_path(sid: str, rel: str) -> Path:
    d = _subject_dir(sid)
    p = (d / safe_rel(rel)).resolve()
    if not str(p).startswith(str(d.resolve())):
        raise SubjectError("That file is outside the subject.")
    return p


def save(sid: str, rel: str, stream, length: int) -> dict:
    if length > MAX_FILE:
        raise SubjectError("That file is over 200 MB.")
    p = file_path(sid, rel)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".part")
    left = length
    with open(tmp, "wb") as fh:
        while left > 0:
            chunk = stream.read(min(1 << 20, left))
            if not chunk:
                break
            fh.write(chunk)
            left -= len(chunk)
    if left:
        tmp.unlink(missing_ok=True)
        raise SubjectError("The upload was cut off. Try that file again.")
    tmp.replace(p)
    return {"saved": rel, "size": length}


def delete_file(sid: str, rel: str) -> dict:
    p = file_path(sid, rel)
    if not p.is_file():
        raise SubjectError("No such file.")
    p.unlink()
    d = _subject_dir(sid).resolve()
    parent = p.parent
    while parent != d and parent.exists() and not any(parent.iterdir()):
        parent.rmdir()
        parent = parent.parent
    return {"deleted": rel}


# ---- mistakes you add yourself, kept in the subject's folder as .mistakes.json ----
MISTAKES = ".mistakes.json"


def _clip(v, n):
    return re.sub(r"\s+", " ", str(v or "")).strip()[:n]


def manual_mistakes(sid: str) -> list[dict]:
    p = _subject_dir(sid) / MISTAKES
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _save_mistakes(sid: str, items: list[dict]) -> None:
    (_subject_dir(sid) / MISTAKES).write_text(json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8")


def add_mistake(sid: str, data: dict) -> dict:
    question = str(data.get("question") or "").strip()[:1000]
    if not question:
        raise SubjectError("Write the question or problem you got wrong.")
    item = {"id": format(int(time.time() * 1000), "x"), "t": time.time(), "question": question,
            "your_answer": str(data.get("your_answer") or "").strip()[:500],
            "correct_answer": str(data.get("correct_answer") or "").strip()[:500],
            "note": str(data.get("note") or "").strip()[:1000], "why": "", "tip": ""}
    items = manual_mistakes(sid)
    items.append(item)
    _save_mistakes(sid, items)
    return item


def update_mistake(sid: str, mid: str, fields: dict) -> dict:
    items = manual_mistakes(sid)
    for it in items:
        if it["id"] == mid:
            for k in ("correct_answer", "why", "tip", "title"):
                if fields.get(k) and (k != "correct_answer" or not it.get("correct_answer")):
                    it[k] = _clip(fields[k], 1000 if k != "title" else 60)
            cards = []
            for c in fields.get("cards") or []:
                opts = [_clip(o, 200) for o in (c.get("options") or []) if _clip(o, 200)]
                ans = c.get("answer")
                if _clip(c.get("prompt"), 400) and 2 <= len(opts) <= 5 and isinstance(ans, int) and 0 <= ans < len(opts):
                    cards.append({"prompt": _clip(c["prompt"], 400), "options": opts, "answer": ans, "explain": _clip(c.get("explain"), 400)})
            if cards:
                it["cards"] = cards[:3]
            _save_mistakes(sid, items)
            return it
    raise SubjectError("No such mistake.")


def delete_mistake(sid: str, mid: str) -> dict:
    items = manual_mistakes(sid)
    keep = [it for it in items if it["id"] != mid]
    if len(keep) == len(items):
        raise SubjectError("No such mistake.")
    _save_mistakes(sid, keep)
    return {"deleted": mid}


def _quiz(q) -> dict | None:
    if not isinstance(q, dict):
        return None
    opts = [_clip(o, 200) for o in (q.get("options") or []) if _clip(o, 200)]
    ans = q.get("answer")
    if not _clip(q.get("question"), 300) or not 2 <= len(opts) <= 5 or not isinstance(ans, int) or not 0 <= ans < len(opts):
        return None
    return {"question": _clip(q["question"], 300), "options": opts, "answer": ans,
            "right": _clip(q.get("right"), 400) or "That's it.", "wrong": _clip(q.get("wrong"), 400) or "Not quite. Look again."}


def clean_desk(raw: dict) -> dict:
    """A reading-desk exercise from Gemini, checked: one wrong step, valid choices, every field the desk reads."""
    steps = []
    seen_wrong = False
    for st in (raw.get("steps") or [])[:6]:
        text = _clip(st.get("text"), 400)
        if not text:
            continue
        if st.get("wrong") and not seen_wrong:   # only the first step marked wrong counts as the wrong one
            seen_wrong = True
            steps.append({"text": text, "focus": [], "wrong": True, "say": _clip(st.get("say"), 400) or "Does this step hold up?",
                          "missed": _clip(st.get("missed"), 400) or "Look at this step again, slowly.",
                          "caught": _clip(st.get("caught"), 400) or "Good catch. That's the step that went wrong."})
        else:
            steps.append({"text": text, "focus": [], "say": _clip(st.get("say"), 400) or "Does this step hold up?",
                          "ok": _clip(st.get("ok"), 400) or "Agreed.", "nudge": _clip(st.get("nudge"), 400) or "This one holds up."})
    wrong = [i for i, st in enumerate(steps) if st.get("wrong")]
    quizzes = {k: _quiz(raw.get(k)) for k in ("read", "why", "fix")}
    if len(steps) < 2 or len(wrong) != 1 or not all(quizzes.values()):
        missing = [k for k, v in quizzes.items() if not v] + (["a wrong step"] if len(wrong) != 1 else []) + (["steps"] if len(steps) < 2 else [])
        raise SubjectError("Gemini's exercise didn't hold together (" + ", ".join(missing) + ").")
    hints = raw.get("hints") or {}
    return {
        "title": _clip(raw.get("title"), 80), "skill": _clip(raw.get("skill"), 60), "problem": _clip(raw.get("problem"), 800),
        "theirs": _clip(raw.get("theirs"), 120), "key": _clip(raw.get("key"), 120),
        "intro": [_clip(x, 400) for x in (raw.get("intro") or [])[:3] if _clip(x, 400)] or ["A classmate worked this one, and one step went wrong. Let's find it."],
        "read": quizzes["read"], "check": _clip(raw.get("check"), 400) or "Now the classmate's working, one step at a time.",
        "steps": steps, "why": quizzes["why"], "fix": quizzes["fix"], "fixed": _clip(raw.get("fixed"), 400),
        "after": [{"text": _clip(a.get("text"), 400), "focus": [], "say": _clip(a.get("say"), 400)} for a in (raw.get("after") or [])[:4] if _clip(a.get("text"), 400)],
        "result": _clip(raw.get("result"), 120), "rule": _clip(raw.get("rule"), 400),
        "hints": {k: [_clip(x, 300) for x in (hints.get(k) or [])[:4] if _clip(x, 300)] or ["Read it once more, slowly."] for k in ("read", "check", "fix")},
        "faq": [{"match": [_clip(m, 40).lower() for m in (f.get("match") or [])[:6] if _clip(m, 40)], "reply": _clip(f.get("reply"), 500)}
                for f in (raw.get("faq") or [])[:4] if _clip(f.get("reply"), 500)],
    }


def simple_desk(it: dict, subject_name: str) -> dict | None:
    """A desk exercise from the mistake itself, with no AI: the answer you gave is the step to catch."""
    question, right, yours = it.get("question", ""), it.get("correct_answer", ""), it.get("your_answer", "")
    if not question or not right:
        return None
    theirs = yours or "(no answer)"
    why = it.get("why") or "It doesn't match the right answer."
    flip = int(it["id"], 16) % 3
    fix_opts = [right, theirs, "Leave it as it is"]
    fix_opts = fix_opts[flip:] + fix_opts[:flip]
    return {
        "title": it.get("title") or (question[:56] + ("…" if len(question) > 56 else "")),
        "skill": it.get("title") or subject_name,
        "problem": question, "theirs": theirs, "key": right,
        "intro": [f"This is a mistake you saved. The answer written down was “{theirs}”, but the key says “{right}”. Let’s find where it slipped.",
                  "First, read the problem on the sheet again: what is it asking for?"],
        "read": {"question": "What does the problem ask for?",
                 "options": ["Exactly what the question asks, in its own words", "Something close to it that's easier", "Only the numbers it gives"],
                 "answer": 0, "right": "Yes. Answering the exact question is half the work.",
                 "wrong": "Not quite. Read the question's last sentence again: that's what it wants."},
        "check": "Here’s the working that was written down. Check each line.",
        "steps": [
            {"text": "The question: " + question, "focus": [], "say": "Step 1 is the question itself. Does it match the sheet?",
             "ok": "Agreed. That’s the question.", "nudge": "This one just restates the problem; it holds up."},
            {"text": "The answer written down: " + theirs, "focus": [], "wrong": True,
             "say": "Step 2 is the answer that was given. Does it hold up against the key?",
             "missed": "Look again: compare this answer with the key on the sheet.",
             "caught": "Right: this is where it went wrong. " + why},
        ],
        "why": {"question": "Why is “" + theirs + "” wrong?",
                "options": [why, "It's right, and the key is wrong", "The question was too hard to answer"],
                "answer": 0, "right": "That’s it.", "wrong": "Not that one. Compare it with the key."},
        "fix": {"question": "What should the answer be?", "options": fix_opts, "answer": fix_opts.index(right),
                "right": "That’s the right answer.", "wrong": "Not quite. Look at the key."},
        "fixed": "The answer: " + right, "after": [], "result": right,
        "rule": it.get("tip") or why,
        "hints": {"read": ["The last sentence usually names what to find."],
                  "check": ["One line doesn't agree with the key.", "Compare the answer line with the key."],
                  "fix": ["The key on the sheet has it."]},
        "faq": [],
    }


def set_desk(sid: str, mid: str, exercise: dict) -> dict:
    items = manual_mistakes(sid)
    for it in items:
        if it["id"] == mid:
            it["desk"] = clean_desk(exercise)
            _save_mistakes(sid, items)
            return {"desk": True, "title": it["desk"]["title"]}
    raise SubjectError("No such mistake.")


def desk_entries() -> list[dict]:
    """Your mistakes' exercises, as scenarios for the reading desk (desk.json)."""
    out = []
    if not UPLOAD_DIR.exists():
        return out
    for d in sorted(UPLOAD_DIR.iterdir(), key=lambda p: _meta(p).get("created", 0) if (p / META).exists() else 0):
        if not d.is_dir() or not (d / META).exists():
            continue
        name = _meta(d).get("name", d.name)
        code = (re.sub(r"[^A-Za-z]", "", name)[:4] or "SUBJ").upper()
        n = 0
        for it in sorted(manual_mistakes(d.name), key=lambda x: x["t"]):
            ex = it.get("desk") or simple_desk(it, name)
            if ex:
                n += 1
                out.append(dict(ex, id=f"u-{d.name}-{it['id']}", subject="my-" + d.name, call=f"AP.{code}.{n:03d}", t=it["t"]))
    out.sort(key=lambda x: x["t"], reverse=True)    # newest first: the desk opens on your latest mistake
    return out


def practice_cards(sid: str, it: dict) -> list[dict]:
    """Flashcards for a mistake you added: Gemini's, or else one built from your answer and the right one."""
    base = f"u-{sid}-{it['id']}"
    if it.get("cards"):
        return [dict(c, id=f"{base}-{i + 1}") for i, c in enumerate(it["cards"])]
    right, yours = it.get("correct_answer", ""), it.get("your_answer", "")
    if right and yours and right.strip().lower() != yours.strip().lower():
        options = [yours, right] if int(it["id"], 16) % 2 else [right, yours]
        return [{"id": base + "-1", "prompt": it["question"], "options": options, "answer": options.index(right),
                 "explain": it.get("why") or f"The answer is {right}, not {yours}."}]
    return []


def card_entries() -> tuple[list[dict], list[dict], dict]:
    """Your subjects and mistakes as the library's card catalog sees them (cards.json, mistakes.json)."""
    subjects, mistakes, details = [], [], {}
    if not UPLOAD_DIR.exists():
        return subjects, mistakes, details
    for d in sorted(UPLOAD_DIR.iterdir(), key=lambda p: _meta(p).get("created", 0) if (p / META).exists() else 0):
        if not d.is_dir() or not (d / META).exists():
            continue
        meta = _meta(d)
        name = meta.get("name", d.name)
        code = (re.sub(r"[^A-Za-z]", "", name)[:4] or "SUBJ").upper()
        rows = []
        for n, it in enumerate(sorted(manual_mistakes(d.name), key=lambda x: x["t"]), 1):
            cards = practice_cards(d.name, it)
            if not cards:
                continue
            mid = f"u-{d.name}-{it['id']}"
            call = f"{code}.YOU.{n:03d}"
            title = it.get("title") or (it["question"][:48] + ("…" if len(it["question"]) > 48 else ""))
            rows.append({"id": mid, "subject": "my-" + d.name, "call": call, "title": title, "skill": name, "cards": cards})
            explanation = " ".join(x for x in (it.get("why"), it.get("tip"), it.get("note")) if x) or "A mistake you added in your " + name + " book."
            details[mid] = {"callNumber": call, "timesMade": 1, "lastSeenDays": max(0, int((time.time() - it["t"]) // 86400)),
                            "explanation": explanation, "wrongExample": it.get("your_answer") or "(no answer written)",
                            "rightExample": it.get("correct_answer") or "(not known yet)"}
        if rows:
            subjects.append({"id": "my-" + d.name, "name": name, "accent": meta.get("color", COLORS[0])})
            mistakes += rows
    return subjects, mistakes, details


def card_known(card_id: str) -> bool:
    return any(c["id"] == card_id for m in card_entries()[1] for c in m["cards"])


def as_mistake(it: dict, subject_name: str) -> dict:
    """A mistake you added, in the same shape as the Action Log's (action_mistakes.find)."""
    return {"id": it["id"], "manual": True, "title": it.get("title", ""), "cards": len(it.get("cards") or []), "desk": bool(it.get("desk") or (it.get("question") and it.get("correct_answer"))),
            "when": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(it["t"])),
            "page": "Added by you", "kind": "wrong answer", "what": "Asked “" + it["question"] + "”",
            "answered": it.get("your_answer", ""), "detail": it.get("correct_answer", ""), "note": it.get("note", ""),
            "why": it.get("why", ""), "tip": it.get("tip", ""), "subject": subject_name}


def kind_of(ext: str) -> str:
    ext = ext.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic"):
        return "image"
    if ext in (".mp3", ".wav", ".m4a", ".ogg"):
        return "audio"
    if ext in (".mp4", ".webm", ".mov"):
        return "video"
    if ext in (".doc", ".docx", ".odt", ".rtf", ".pages"):
        return "document"
    if ext in (".ppt", ".pptx", ".key", ".odp"):
        return "slides"
    if ext in (".xls", ".xlsx", ".numbers", ".ods", ".csv"):
        return "sheet"
    if ext in TEXTLIKE:
        return "text"
    return "file"


def subjects(with_mistakes: bool = True) -> dict:
    out = []
    if UPLOAD_DIR.exists():
        for d in sorted(UPLOAD_DIR.iterdir()):
            if not d.is_dir() or not (d / META).exists():
                continue
            meta = _meta(d)
            chapters: dict[str, list] = {}
            size = 0
            for p in sorted(d.rglob("*")):
                if not p.is_file() or p.name == META or p.name.endswith(".part") or any(x.startswith(".") for x in p.relative_to(d).parts):
                    continue
                rel = p.relative_to(d).as_posix()
                parts = rel.split("/")
                chapter = parts[0] if len(parts) > 1 else ""
                st = p.stat()
                size += st.st_size
                chapters.setdefault(chapter, []).append({
                    "path": rel, "name": p.name, "folder": "/".join(parts[1:-1]) if len(parts) > 2 else "",
                    "size": st.st_size, "modified": st.st_mtime, "kind": kind_of(p.suffix),
                    "opens": p.suffix.lower() in INLINE})
            ordered = [{"name": k or "Loose files", "loose": not k, "files": v} for k, v in sorted(chapters.items(), key=lambda kv: (kv[0] == "", kv[0].lower()))]
            name = meta.get("name", d.name)
            out.append({"id": d.name, "name": name, "color": meta.get("color", COLORS[0]), "created": meta.get("created", 0),
                        "topic": topic_of(name), "chapters": ordered,
                        "files": sum(len(c["files"]) for c in ordered), "size": size, "mistakes": [],
                        "organized": organizer.status(d.name, d)})
    out.sort(key=lambda s: s["created"])
    unfiled = 0
    if with_mistakes:
        found = action_mistakes.summary(None, limit=1000)["mistakes"]
        for m in found:
            target = file_mistake(m, out)
            if target:
                target["mistakes"].append(m)
            else:
                unfiled += 1
        for s in out:
            s["mistakes"] += [as_mistake(it, s["name"]) for it in manual_mistakes(s["id"])]
            s["mistakes"].sort(key=lambda m: m.get("when", ""), reverse=True)
    return {"subjects": out, "unfiled": unfiled}


def all_manual(since_ms: float = 0) -> list[dict]:
    """Every mistake you added, in every subject (for the hub's panel)."""
    out = []
    if UPLOAD_DIR.exists():
        for d in UPLOAD_DIR.iterdir():
            if d.is_dir() and (d / META).exists():
                name = _meta(d).get("name", d.name)
                for it in manual_mistakes(d.name):
                    if it["t"] * 1000 >= since_ms:
                        out.append(as_mistake(it, name))
    return out


def file_mistake(m: dict, subs: list[dict]):
    """The subject a mistake belongs in: one whose name appears in it, else one on the same topic."""
    text = " ".join(str(m.get(k, "")) for k in ("what", "detail", "answered", "page"))
    words = _words(text)
    for s in subs:
        name = _words(s["name"]).strip()
        if name and " " + name + " " in words:
            return s
    topic = m.get("topic") or topic_of(text)
    if topic:
        for s in subs:
            if s["topic"] == topic:
                return s
        if topic in ("biology", "chemistry", "physics"):
            for s in subs:
                if s["topic"] == "science":
                    return s
    return None


def mime(p: Path) -> str:
    ext = p.suffix.lower()
    if ext not in INLINE:
        return "application/octet-stream"
    if ext in TEXTLIKE:
        return "text/plain; charset=utf-8"
    return mimetypes.guess_type(p.name)[0] or "application/octet-stream"
