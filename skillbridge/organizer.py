"""Turns a subject's uploaded files into an organised study book, using Google's Gemini API.

Gemini reads every file it can (text and Markdown, PDFs and images as they are, the text inside
Word and PowerPoint files) together with the learner's mistakes in that subject, and writes a
book: chapters by topic (not by folder), notes, key terms, a worked example, self-check questions
with answers, and an explanation of each mistake. The book is saved next to the files as
.book.json and shown when the subject's book is opened in the library.

This is the one part of SkillBridge that uses the network: the subject's files go to Google
to be read. Without a key (GEMINI_API_KEY, or data/secrets/gemini.key, which git ignores) the
library works as before and simply has no organised book.
"""
from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
import urllib.error
import urllib.request
import zipfile
from html import unescape
from pathlib import Path

from . import my_subjects
from .content import ROOT

log = logging.getLogger("skillbridge.organizer")
KEY_FILE = ROOT / "data" / "secrets" / "gemini.key"
API = "https://generativelanguage.googleapis.com"
# First model that answers wins. On the free tier each model has its own daily allowance (20
# requests a day per model at the time of writing), so a long list of fallbacks keeps the library
# working through a busy day: when one model is out of requests, the next one answers.
MODELS = [m for m in [os.environ.get("GEMINI_MODEL"), "gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash",
                      "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest"] if m]
_spent: dict[str, float] = {}     # model -> time it ran out of requests (skipped for an hour)
_slow: dict[str, float] = {}      # model -> time it timed out (skipped for ten minutes)
BOOK = ".book.json"
INLINE_LIMIT = 14 * 1024 * 1024        # request size for files sent inline; bigger ones use the Files API
TEXT_LIMIT = 80_000                     # characters kept from any one text file
TEXT_TOTAL = 600_000

_jobs: dict[str, dict] = {}
_lock = threading.Lock()


class OrganizeError(Exception):
    pass


def api_key() -> str | None:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key and KEY_FILE.exists():
        key = KEY_FILE.read_text(encoding="utf-8").strip()
    return key or None


def available() -> bool:
    return bool(api_key())


# ---------------------------------------------------------------------------- reading files
def _docx_text(p: Path) -> str:
    with zipfile.ZipFile(p) as z:
        xml = z.read("word/document.xml").decode("utf-8", "ignore")
    xml = re.sub(r"</w:p>", "\n", xml)
    xml = re.sub(r"<w:tab/>", "\t", xml)
    return unescape(re.sub(r"<[^>]+>", "", xml))


def _pptx_text(p: Path) -> str:
    out = []
    with zipfile.ZipFile(p) as z:
        slides = sorted((n for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)),
                        key=lambda n: int(re.search(r"(\d+)", n.rsplit("/", 1)[1])[1]))
        for i, n in enumerate(slides, 1):
            xml = z.read(n).decode("utf-8", "ignore")
            words = [unescape(t) for t in re.findall(r"<a:t>([^<]*)</a:t>", xml)]
            out.append(f"[Slide {i}] " + " ".join(words))
    return "\n".join(out)


def _xlsx_text(p: Path) -> str:
    with zipfile.ZipFile(p) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            shared = [unescape(t) for t in re.findall(r"<t[^>]*>([^<]*)</t>", z.read("xl/sharedStrings.xml").decode("utf-8", "ignore"))]
        return " | ".join(shared[:4000])


MEDIA = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
         ".webp": "image/webp", ".heic": "image/heic", ".gif": "image/gif"}
TEXT = {".txt", ".md", ".csv", ".py", ".java", ".c", ".cpp", ".json", ".js", ".html", ".htm", ".tex", ".rtf"}


def read_files(subject_dir: Path):
    """(parts for the request, files read, files skipped with a reason)."""
    parts, read, skipped = [], [], []
    inline_bytes = 0
    text_total = 0
    for p in sorted(subject_dir.rglob("*")):
        rel_parts = p.relative_to(subject_dir).parts
        if not p.is_file() or any(x.startswith(".") for x in rel_parts) or p.name.endswith(".part"):
            continue
        rel = p.relative_to(subject_dir).as_posix()
        ext = p.suffix.lower()
        try:
            text = None
            if ext in TEXT:
                text = p.read_text(encoding="utf-8", errors="ignore")
                if ext in (".html", ".htm"):
                    text = unescape(re.sub(r"<[^>]+>", " ", text))
            elif ext == ".docx":
                text = _docx_text(p)
            elif ext == ".pptx":
                text = _pptx_text(p)
            elif ext == ".xlsx":
                text = _xlsx_text(p)
            if text is not None:
                text = text.strip()
                if not text:
                    skipped.append({"path": rel, "reason": "empty"})
                    continue
                if text_total > TEXT_TOTAL:
                    skipped.append({"path": rel, "reason": "too much text in this subject to read at once"})
                    continue
                text = text[:TEXT_LIMIT]
                text_total += len(text)
                parts.append({"text": f"=== File: {rel} ===\n{text}"})
                read.append(rel)
            elif ext in MEDIA:
                size = p.stat().st_size
                parts.append({"text": f"=== File: {rel} ({'PDF' if ext == '.pdf' else 'image'}) ==="})
                if inline_bytes + size <= INLINE_LIMIT:
                    parts.append({"inline_data": {"mime_type": MEDIA[ext], "data": base64.b64encode(p.read_bytes()).decode()}})
                    inline_bytes += size
                else:
                    uri = upload_file(p, MEDIA[ext])
                    parts.append({"file_data": {"mime_type": MEDIA[ext], "file_uri": uri}})
                read.append(rel)
            else:
                skipped.append({"path": rel, "reason": "this kind of file can't be read yet"})
        except (OSError, zipfile.BadZipFile, KeyError, OrganizeError) as exc:
            skipped.append({"path": rel, "reason": "could not be read (" + str(exc)[:80] + ")"})
    return parts, read, skipped


# ---------------------------------------------------------------------------- Gemini calls
def _request(url: str, body: bytes | None, headers: dict, timeout: int = 300, method: str = "POST"):
    req = urllib.request.Request(url, data=body, headers=dict(headers, **{"x-goog-api-key": api_key()}), method=method)
    return urllib.request.urlopen(req, timeout=timeout)


def upload_file(p: Path, mime: str) -> str:
    """Large PDFs and images go through the Files API (kept by Google for 48 hours)."""
    size = p.stat().st_size
    start = _request(API + "/upload/v1beta/files", json.dumps({"file": {"display_name": p.name}}).encode(), {
        "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": str(size), "X-Goog-Upload-Header-Content-Type": mime,
        "Content-Type": "application/json"}, timeout=60)
    url = start.headers.get("X-Goog-Upload-URL")
    if not url:
        raise OrganizeError("Google did not accept the upload")
    done = json.load(_request(url, p.read_bytes(), {"X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize",
                                                     "Content-Length": str(size)}, timeout=600))
    f = done["file"]
    for _ in range(60):
        if f.get("state") in (None, "ACTIVE"):
            return f["uri"]
        if f.get("state") == "FAILED":
            raise OrganizeError("Google could not process the file")
        time.sleep(2)
        f = json.load(_request(API + "/v1beta/" + f["name"], None, {}, timeout=30, method="GET"))
    raise OrganizeError("Google took too long to process the file")


def call(contents: list, schema: dict, *, system: str | None = None, temperature: float = 0.4,
         thinking: str = "low", timeout: int = 300) -> tuple[dict, str]:
    """Asks Gemini for JSON matching `schema`, trying each model in MODELS until one answers.
    A model out of requests (429) is skipped for an hour; a model that rejects the thinking level
    is asked again with a lower one. Returns (the parsed JSON, the model that answered)."""
    errors = []
    now = time.time()
    for model in MODELS:
        if now - _spent.get(model, 0) < 3600 or now - _slow.get(model, 0) < 600:
            continue
        levels = [thinking, "low", None] if model.startswith("gemini-3") else [None]
        for level in dict.fromkeys(levels):
            cfg = {"responseMimeType": "application/json", "responseSchema": schema, "temperature": temperature}
            if level:
                cfg["thinkingConfig"] = {"thinkingLevel": level}
            body = {"contents": contents, "generationConfig": cfg}
            if system:
                body["system_instruction"] = {"parts": [{"text": system}]}
            try:
                resp = json.load(_request(f"{API}/v1beta/models/{model}:generateContent", json.dumps(body).encode(),
                                          {"Content-Type": "application/json"}, timeout=timeout))
                cand = (resp.get("candidates") or [{}])[0]
                text = "".join(x.get("text", "") for x in (cand.get("content") or {}).get("parts", []))
                if not text:
                    raise OrganizeError("empty answer (" + str(cand.get("finishReason", "no reason")) + ")")
                return json.loads(text), resp.get("modelVersion", model)
            except urllib.error.HTTPError as exc:
                detail = exc.read()[:400].decode("utf-8", "ignore")
                if exc.code == 400 and "hinking" in detail:
                    continue                      # try the same model with a lower thinking level
                errors.append(f"{model}: HTTP {exc.code}")
                log.warning("gemini %s failed: %s %s", model, exc.code, detail[:200])
                if exc.code == 429:
                    _spent[model] = time.time()
                elif exc.code in (401, 403):
                    msg = re.search(r'"message":\s*"([^"]+)"', detail)
                    raise OrganizeError("Gemini refused the key: " + (msg[1] if msg else f"HTTP {exc.code}")) from exc
                break                             # next model
            except (TimeoutError, OSError, ValueError, OrganizeError) as exc:
                if isinstance(exc, TimeoutError) or "timed out" in str(exc):
                    _slow[model] = time.time()
                errors.append(f"{model}: {str(exc)[:80]}")
                log.warning("gemini %s failed: %s", model, exc)
                break
    if not errors:
        raise OrganizeError("every Gemini model is out of requests for now; try again in an hour")
    if all("429" in e for e in errors):
        raise OrganizeError("the Gemini key is out of free requests for today; try again later")
    raise OrganizeError("Gemini didn't answer (" + "; ".join(errors)[:300] + ")")


S = {"type": "STRING"}


def _arr(items):
    return {"type": "ARRAY", "items": items}


def _obj(props, required):
    return {"type": "OBJECT", "properties": props, "required": required}


SCHEMA = _obj({
    "title": S,
    "overview": S,
    "chapters": _arr(_obj({
        "title": S,
        "summary": S,
        "sources": _arr(S),
        "sections": _arr(_obj({
            "heading": S,
            "notes": _arr(S),
            "key_terms": _arr(_obj({"term": S, "meaning": S}, ["term", "meaning"])),
            "example": S,
            "check": _arr(_obj({"question": S, "answer": S}, ["question", "answer"])),
        }, ["heading", "notes", "key_terms", "example", "check"])),
    }, ["title", "summary", "sources", "sections"])),
    "mistake_review": _arr(_obj({"question": S, "your_answer": S, "correct_answer": S, "why": S, "tip": S},
                                ["question", "correct_answer", "why"])),
}, ["title", "overview", "chapters"])

INSTRUCTIONS = """You organise a high-school student's own study materials for one school subject into a clear study book.

Rules:
- Use only what is in the student's files (and, for the mistake review, their mistakes). Do not invent topics the files don't cover. If something in the files is wrong, gently correct it in the notes.
- Organise by topic in a sensible teaching order, not by file or folder. Merge material on the same topic from different files. Aim for 2 to 8 chapters, each with 1 to 5 sections.
- "sources" lists the exact file paths (as given after "=== File:") each chapter draws on.
- Notes are short, plain sentences a student can revise from: one idea per note, 3 to 8 notes per section. No markdown, no bullet characters, no headings inside strings.
- Write maths in plain text: x^2, 3/4, sqrt(x), 2x + 3 = 11. Show working step by step in "example" when the topic involves calculation; leave "example" empty otherwise.
- key_terms: only real terms from the material, with a one-line meaning. check: 1 to 3 short questions per section with their answers, to test the section.
- mistake_review: one entry per mistake listed below (skip any that don't belong to this subject): the question, what the student answered, the correct answer, why, and a short tip so it doesn't happen again. Empty list if there are none.
- title is the subject's name as the student would say it; overview is 2 or 3 sentences on what the book covers."""


def generate(subject_name: str, parts: list, mistakes: list) -> tuple[dict, str]:
    mistake_text = "\n".join(
        f"- Question: {m.get('what', '')} | They answered: {m.get('answered', '')} | Note: {m.get('detail', '')}"
        for m in mistakes[:40]) or "(none)"
    contents = [{"role": "user", "parts": [{"text": f"Subject: {subject_name}\n\nThe student's mistakes in this subject:\n{mistake_text}\n\nTheir files follow."}]
                 + parts + [{"text": "Now write the study book as JSON."}]}]
    return call(contents, SCHEMA, system=INSTRUCTIONS, temperature=0.4, thinking="low", timeout=300)


CARD = _obj({"prompt": S, "options": _arr(S), "answer": {"type": "INTEGER"}, "explain": S}, ["prompt", "options", "answer", "explain"])
EXPLAIN = _obj({"title": S, "correct_answer": S, "why": S, "tip": S, "cards": _arr(CARD)},
               ["title", "correct_answer", "why", "tip", "cards"])


def explain(subject_name: str, item: dict) -> dict:
    """The right answer (if the learner didn't give one), why theirs was wrong, and a tip."""
    prompt = (f"Subject: {subject_name}\nA high-school student got this wrong.\n"
              f"Question or problem: {item.get('question', '')}\n"
              f"Their answer: {item.get('your_answer') or '(not given)'}\n"
              f"The right answer they were given: {item.get('correct_answer') or '(not given: work it out)'}\n"
              f"Their note on what went wrong: {item.get('note') or '(none)'}\n\n"
              "Reply with: a title naming the idea they got wrong (3 to 6 words, like 'Counting valence electrons'); the correct "
              "answer (short, final answer only); why their answer is wrong or what the mistake was, in one or two plain sentences; "
              "one short tip so it doesn't happen again; and two multiple-choice practice cards that test the same idea in new "
              "ways (not the same question). Each card has a prompt, exactly 3 options with one right answer whose position "
              "varies, answer = the 0-based index of the right option, and a one-sentence explain. Make the wrong options the "
              "mistakes a student would really make (like theirs). Plain text, maths as 3/4, x^2.")
    try:
        return call([{"role": "user", "parts": [{"text": prompt}]}], EXPLAIN, temperature=0.2, thinking="low", timeout=40)[0]
    except OrganizeError as exc:
        raise my_subjects.SubjectError("Gemini couldn't explain it right now: " + str(exc) + ".") from exc


QUIZ = _obj({"question": S, "options": _arr(S), "answer": {"type": "INTEGER"}, "right": S, "wrong": S},
            ["question", "options", "answer", "right", "wrong"])
DESK = _obj({
    "title": S, "skill": S, "problem": S, "theirs": S, "key": S,
    "intro": _arr(S), "read": QUIZ, "check": S,
    "steps": _arr(_obj({"text": S, "wrong": {"type": "BOOLEAN"}, "say": S, "ok": S, "nudge": S, "missed": S, "caught": S},
                       ["text", "wrong", "say"])),
    "why": QUIZ, "fix": QUIZ, "fixed": S,
    "after": _arr(_obj({"text": S, "say": S}, ["text", "say"])),
    "result": S, "rule": S,
    "hints": _obj({"read": _arr(S), "check": _arr(S), "fix": _arr(S)}, ["read", "check", "fix"]),
    "faq": _arr(_obj({"match": _arr(S), "reply": S}, ["match", "reply"])),
}, ["title", "skill", "problem", "theirs", "key", "intro", "read", "check", "steps", "why", "fix", "fixed", "after", "result", "rule", "hints", "faq"])

DESK_INSTRUCTIONS = """You write one "find the wrong step" exercise for a high-school student's reading desk, built from a mistake they made.

A classmate solves a NEW problem that tests the same idea (not the student's exact question), and in exactly one step makes the same kind of mistake the student made. The student reads the problem, checks the classmate's steps one by one, says why the wrong step is wrong, picks the fix, and sees the corrected ending. A friendly tutor guides them without giving the answer away.

Write:
- title (3 to 6 words), skill (the idea, 2 to 4 words), problem (the new problem, 1 to 3 sentences), theirs (the classmate's wrong final answer), key (the correct final answer).
- intro: 2 short tutor messages: first says a classmate got `theirs` but the key says `key` and one step went wrong; second asks the student to read the problem.
- read: a multiple-choice question about what the problem asks for (3 options).
- check: one tutor sentence introducing the classmate's steps.
- steps: 3 to 5 steps of the classmate's working, in order. Exactly one has wrong = true: the step with the student's kind of mistake. Every step has text and say (the tutor asks whether the step holds up, without saying if it's wrong). Correct steps also have ok (agreeing) and nudge (if the student wrongly flags it: why it holds up). The wrong step also has missed (a nudge when the student passes over it, no answer given) and caught (praise naming the mistake). Steps after the wrong one carry its error forward.
- why: multiple choice: why is that step wrong (3 options). fix: multiple choice: what should the step say (3 options). fixed: the corrected step text.
- after: 1 to 3 corrected steps from the fix to the right answer, each with text and a tutor say. result: the right final answer. rule: one or two sentences to remember.
- hints: read (2), check (3, getting more specific, never naming the step outright), fix (2).
- faq: 2 or 3 entries: match (lowercase words a student might type) and reply (a short explanation).
Multiple choice: exactly 3 options, answer = 0-based index of the right one, with its position varying; right = short praise with the reason; wrong = a nudge back. Plain text, maths as 3/4, x^2, sqrt(x). Keep every tutor line under 40 words."""


def desk_exercise(subject_name: str, item: dict) -> dict:
    prompt = (f"Subject: {subject_name}\nThe student's mistake:\nQuestion: {item.get('question', '')}\n"
              f"Their answer: {item.get('your_answer') or '(not given)'}\nRight answer: {item.get('correct_answer') or '(work it out)'}\n"
              f"What went wrong: {item.get('why') or item.get('note') or '(work it out)'}\n\nWrite the exercise as JSON.")
    try:
        # minimal thinking: about 10 s instead of about 2 minutes for this long, structured answer
        return call([{"role": "user", "parts": [{"text": prompt}]}], DESK, system=DESK_INSTRUCTIONS, temperature=0.5,
                    thinking="minimal", timeout=45)[0]
    except OrganizeError as exc:
        raise my_subjects.SubjectError("Gemini couldn't write the desk exercise right now: " + str(exc) + ".") from exc


# ---------------------------------------------------------------------------- jobs
def fingerprint(d: Path) -> str:
    items = []
    for p in sorted(d.rglob("*")):
        if p.is_file() and not any(x.startswith(".") for x in p.relative_to(d).parts):
            st = p.stat()
            items.append(f"{p.relative_to(d).as_posix()}:{st.st_size}:{int(st.st_mtime)}")
    return hashlib.sha1("|".join(items).encode()).hexdigest()


def status(sid: str, d: Path) -> dict:
    with _lock:
        job = dict(_jobs.get(sid) or {})
    out = {"available": available()}
    book = d / BOOK
    if book.exists():
        try:
            meta = json.loads(book.read_text(encoding="utf-8"))
            out.update({"done": True, "generated": meta.get("generated"), "model": meta.get("model"),
                        "stale": meta.get("fingerprint") != fingerprint(d)})
        except (OSError, ValueError):
            pass
    if job:
        out["state"] = job["state"]
        if job.get("error"):
            out["error"] = job["error"]
        if job.get("step"):
            out["step"] = job["step"]
    return out


def book(sid: str) -> dict:
    d = my_subjects.subject_dir(sid)
    p = d / BOOK
    if not p.exists():
        raise my_subjects.SubjectError("This subject hasn't been organised yet.")
    return json.loads(p.read_text(encoding="utf-8"))


def start(sid: str) -> dict:
    if not available():
        raise my_subjects.SubjectError("No Gemini API key is set up, so subjects can't be organised.")
    d = my_subjects.subject_dir(sid)
    with _lock:
        if (_jobs.get(sid) or {}).get("state") == "running":
            return {"state": "running"}
        _jobs[sid] = {"state": "running", "step": "Reading your files", "started": time.time()}
    threading.Thread(target=_run, args=(sid, d), daemon=True, name="organize-" + sid).start()
    return {"state": "running"}


def _step(sid, text):
    with _lock:
        if sid in _jobs:
            _jobs[sid]["step"] = text


def _run(sid: str, d: Path):
    try:
        meta = json.loads((d / my_subjects.META).read_text(encoding="utf-8"))
        name = meta.get("name", sid)
        fp = fingerprint(d)
        parts, read, skipped = read_files(d)
        if not read:
            raise OrganizeError("None of this subject's files can be read yet (try PDFs, Word, PowerPoint, images or text).")
        mine = next((s for s in my_subjects.subjects()["subjects"] if s["id"] == sid), None)
        mistakes = mine["mistakes"] if mine else []
        _step(sid, f"Gemini is reading {len(read)} file{'s' if len(read) != 1 else ''}")
        result, model = generate(name, parts, mistakes)
        # keep only sources that are real files
        for ch in result.get("chapters", []):
            ch["sources"] = [s for s in ch.get("sources", []) if s in read]
        (d / BOOK).write_text(json.dumps({"generated": time.time(), "model": model, "fingerprint": fp, "read": read,
                                          "skipped": skipped, "mistakes_reviewed": len(mistakes), "book": result},
                                         ensure_ascii=False, indent=1), encoding="utf-8")
        with _lock:
            _jobs[sid] = {"state": "done"}
    except Exception as exc:   # the job runs in its own thread: report every failure to the page
        log.warning("organizing %s failed: %s", sid, exc)
        with _lock:
            _jobs[sid] = {"state": "error", "error": str(exc)[:300]}
