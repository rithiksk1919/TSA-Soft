"""HTTP layer: JSON API + static files. Standard library only.

All logic lives in Service; this module only parses requests and routes them.
"""
from __future__ import annotations

import csv
import io
import json
import logging
import mimetypes
import os
import re
import traceback
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import demo, tts
from .gym import Gym
from .hub import Hub
from .lessons import load_lesson
from .library import Library
from .content import ROOT, public_diagnostic
from .evaluators import python_runner
from .service import Service, ServiceError

WEB_DIR = ROOT / "web"             # practice screens, served at /practice/
STATIC_DIR = ROOT / "static"       # hub/ (the school) and library/
PLOTS_DIR = ROOT / "sim" / "output"
log = logging.getLogger("skillbridge.server")
ROUTES: list[tuple[str, re.Pattern, callable]] = []


def route(method: str, pattern: str):
    def deco(fn):
        ROUTES.append((method, re.compile("^" + pattern + "$"), fn))
        return fn
    return deco


class App:
    def __init__(self, svc: Service):
        self.svc = svc
        self.lib = Library(svc)
        self.gym = Gym(svc)
        self.hub = Hub(svc, self.lib, self.gym)


# ---- API ------------------------------------------------------------------------------
@route("GET", r"/api/health")
def health(app, req, m):
    return {"ok": True, "sandbox": python_runner.sandbox_kind()}


@route("GET", r"/api/profiles")
def profiles(app, req, m):
    return app.svc.list_profiles()


@route("POST", r"/api/profiles")
def create_profile(app, req, m):
    return app.svc.create_profile(req.body.get("name", ""))


@route("DELETE", r"/api/profiles/(\d+)")
def delete_profile(app, req, m):
    app.svc.delete_profile(int(m[1]))
    return {"ok": True}


@route("GET", r"/api/catalog")
def catalog(app, req, m):
    pid = req.query.get("profile")
    return app.svc.catalog_public(int(pid) if pid else None)


@route("GET", r"/api/profiles/(\d+)/dashboard")
def dashboard(app, req, m):
    return app.svc.dashboard(int(m[1]))


@route("GET", r"/api/profiles/(\d+)/recommendation")
def recommendation(app, req, m):
    return app.svc.recommendation(int(m[1]), req.query.get("domain", "python"), req.query.get("skill"))


@route("POST", r"/api/profiles/(\d+)/episodes")
def start(app, req, m):
    b = req.body
    return app.svc.start_episode(int(m[1]), b.get("domain"), b.get("scenario_id"), b.get("skill"))


@route("GET", r"/api/profiles/(\d+)/diagnostic/(\w+)")
def diag_get(app, req, m):
    pid, domain = int(m[1]), m[2]
    return {"items": public_diagnostic(app.svc.cat, domain), "status": app.svc.diagnostic_status(pid, domain),
            "skills": {s["id"]: s["name"] for s in app.svc.cat.skills_in(domain)}}


@route("POST", r"/api/profiles/(\d+)/diagnostic/(\w+)")
def diag_post(app, req, m):
    return app.svc.submit_diagnostic(int(m[1]), m[2], req.body.get("answers", {}))


@route("GET", r"/api/episodes/(\d+)")
def episode(app, req, m):
    return app.svc.episode(int(m[1]))


@route("POST", r"/api/episodes/(\d+)/actions")
def action(app, req, m):
    return app.svc.record_action(int(m[1]), req.body.get("type"), req.body.get("payload") or {})


@route("POST", r"/api/episodes/(\d+)/hint")
def hint(app, req, m):
    return app.svc.hint(int(m[1]))


@route("POST", r"/api/episodes/(\d+)/submit")
def submit(app, req, m):
    return app.svc.submit(int(m[1]), req.body)


@route("POST", r"/api/episodes/(\d+)/give_up")
def give_up(app, req, m):
    return app.svc.give_up(int(m[1]))


@route("POST", r"/api/episodes/(\d+)/coach")
def coach_fb(app, req, m):
    return app.svc.coach(int(m[1]), refresh=bool(req.body.get("refresh")))


@route("GET", r"/api/profiles/(\d+)/hub")
def hub_summary(app, req, m):
    return app.hub.summary(int(m[1]))


@route("GET", r"/api/profiles/(\d+)/lesson/(\w+)")
def lesson(app, req, m):
    pid = int(m[1])
    app.svc.profile(pid)
    data = load_lesson(app.svc.cat, m[2])
    state = app.svc.load_state(pid, data["domain"])
    data["mastery"] = round(state.m(m[2]), 2)
    return data


@route("POST", r"/api/profiles/(\d+)/lesson/(\w+)/viewed")
def lesson_viewed(app, req, m):
    pid = int(m[1])
    app.svc.profile(pid)
    app.svc.cat.skill(m[2])
    app.svc.db.log_action(pid, None, "lesson_viewed", {"skill": m[2], "station": str(req.body.get("station", ""))[:20]})
    return {"ok": True}


@route("POST", r"/api/profiles/(\d+)/lesson/(\w+)/practice")
def lesson_practice(app, req, m):
    pid = int(m[1])
    app.svc.db.log_action(pid, None, "lesson_viewed", {"skill": m[2], "station": "ready"})
    return app.svc.start_episode(pid, skill=m[2])


@route("POST", r"/api/profiles/(\d+)/gym/start")
def gym_start(app, req, m):
    return app.gym.start(int(m[1]), req.body.get("skill"))


@route("GET", r"/api/gym/(\d+)")
def gym_state(app, req, m):
    return app.gym.state(int(m[1]))


@route("POST", r"/api/gym/(\d+)/shot")
def gym_shot(app, req, m):
    return app.gym.shoot(int(m[1]), req.body.get("line"))


@route("POST", r"/api/profiles/(\d+)/break")
def take_break(app, req, m):
    pid = int(m[1])
    app.svc.profile(pid)
    event = str(req.body.get("event", ""))
    if event not in ("start", "finish", "skip"):
        raise ServiceError("Unknown break event.")
    if event == "finish":
        app.svc.db.log_action(pid, None, "break", {"event": event})
    else:
        app.svc.db.log_action(pid, None, "break_" + event, {})
    return {"ok": True}


@route("POST", r"/api/profiles/(\d+)/cards/([\w-]+)")
def card_box(app, req, m):
    return app.lib.set_box(int(m[1]), m[2], req.body.get("box", 1))


@route("POST", r"/api/demo/reset")
def demo_reset(app, req, m):
    return demo.reset_demo(app.svc)


@route("GET", r"/api/downloads")
def downloads(app, req, m):
    pid = req.query.get("profile")
    items = []
    if pid:
        items += [
            {"id": "export-json", "name": "my-skillbridge-data.json", "kind": "Your data", "course": "All courses",
             "desc": "Every action, attempt, mastery change and selection reason", "url": f"/api/profiles/{pid}/export.json", "type": "JSON document"},
            {"id": "export-episodes", "name": "practice-history.csv", "kind": "Your data", "course": "All courses",
             "desc": "One row per scenario attempt", "url": f"/api/profiles/{pid}/export/episodes.csv", "type": "CSV document"},
            {"id": "export-actions", "name": "action-log.csv", "kind": "Your data", "course": "All courses",
             "desc": "Every recorded action with timestamps", "url": f"/api/profiles/{pid}/export/actions.csv", "type": "CSV document"},
        ]
    for sc in app.svc.cat.scenarios_in("python"):
        items.append({"id": f"starter-{sc['id']}", "name": f"{sc['id']}.py", "kind": "Starter file", "course": "Python Debugging",
                      "desc": sc["title"], "url": f"/files/starter/{sc['id']}.py", "type": "Python file",
                      "size": len(sc["starter"].encode())})
    if PLOTS_DIR.exists():
        for p in sorted(PLOTS_DIR.glob("*.png")):
            items.append({"id": f"plot-{p.stem}", "name": p.name, "kind": "Simulation plot", "course": "Engine evaluation",
                          "desc": p.stem.replace("_", " "), "url": f"/files/plots/{p.name}", "type": "PNG image", "size": p.stat().st_size})
    return items


# ---- server plumbing ------------------------------------------------------------------------
class Request:
    def __init__(self, query: dict, body: dict):
        self.query, self.body = query, body


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        server_version = "SkillBridge/1.0"

        def log_message(self, fmt, *args):
            log.debug("%s %s", self.address_string(), fmt % args)

        def _send(self, status: int, body: bytes, ctype: str, extra: dict | None = None):
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status: int, obj):
            self._send(status, json.dumps(obj).encode(), "application/json; charset=utf-8")

        def _dispatch(self, method: str):
            url = urlparse(self.path)
            path = url.path
            if path.startswith("/api/"):
                return self._api(method, url)
            if method != "GET":
                return self._json(405, {"error": "method not allowed"})
            if path.startswith("/files/"):
                return self._files(path)
            return self._static(path)

        def _api(self, method, url):
            special = re.match(r"^/api/profiles/(\d+)/export(?:\.json|/(\w+)\.csv)$", url.path)
            if special and method == "GET":
                return self._export(int(special[1]), special[2])
            if url.path == "/api/tts" and method == "POST":
                return self._tts()
            for meth, pat, fn in ROUTES:
                m = pat.match(url.path)
                if m and meth == method:
                    try:
                        length = int(self.headers.get("Content-Length") or 0)
                        if length > 200_000:
                            return self._json(413, {"error": "request too large"})
                        raw = self.rfile.read(length) if length else b""
                        body = json.loads(raw) if raw else {}
                        query = {k: v[0] for k, v in parse_qs(url.query).items()}
                        return self._json(200, fn(app, Request(query, body if isinstance(body, dict) else {}), m))
                    except (ServiceError, ValueError, KeyError) as exc:
                        return self._json(400, {"error": str(exc).strip("'\"")})
                    except Exception:
                        log.error("unhandled error\n%s", traceback.format_exc())
                        return self._json(500, {"error": "internal error"})
            return self._json(404, {"error": "not found"})

        def _export(self, pid: int, table: str | None):
            try:
                data = app.svc.export(pid)
            except ServiceError as exc:
                return self._json(404, {"error": str(exc)})
            if table is None:
                body = json.dumps(data, indent=2).encode()
                return self._send(200, body, "application/json", {"Content-Disposition": 'attachment; filename="my-skillbridge-data.json"'})
            rows = data["tables"].get(table)
            if rows is None:
                return self._json(404, {"error": "unknown table"})
            buf = io.StringIO()
            if rows:
                w = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
                w.writeheader()
                w.writerows(rows)
            return self._send(200, buf.getvalue().encode(), "text/csv; charset=utf-8",
                              {"Content-Disposition": f'attachment; filename="{table}.csv"'})

        def _tts(self):
            # One spoken line as MP3. 503 tells the browser to read the line with its own voice.
            try:
                length = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(length) or b"{}") if 0 < length <= 4000 else {}
                audio = tts.speech(body.get("text", "") if isinstance(body, dict) else "")
            except ValueError as exc:
                return self._json(400, {"error": str(exc)})
            except tts.TTSUnavailable as exc:
                log.info("tts unavailable: %s", exc)
                return self._json(503, {"error": "spoken audio is not available", "fallback": "browser"})
            return self._send(200, audio, "audio/mpeg")

        def _files(self, path):
            m = re.match(r"^/files/starter/([\w-]+)\.py$", path)
            if m and m[1] in app.svc.cat.scenarios and app.svc.cat.scenarios[m[1]].get("starter"):
                return self._send(200, app.svc.cat.scenarios[m[1]]["starter"].encode(), "text/x-python; charset=utf-8",
                                  {"Content-Disposition": f'attachment; filename="{m[1]}.py"'})
            m = re.match(r"^/files/plots/([\w-]+\.png)$", path)
            if m and (PLOTS_DIR / m[1]).is_file():
                return self._send(200, (PLOTS_DIR / m[1]).read_bytes(), "image/png")
            return self._json(404, {"error": "not found"})

        def _profile_from_cookie(self):
            found = re.search(r"(?:^|;\s*)sb_profile=(\d+)", self.headers.get("Cookie") or "")
            if not found:
                return None
            pid = int(found[1])
            if not app.svc.db.one("SELECT id FROM profiles WHERE id = ?", (pid,)):
                return None
            return pid

        def _serve_file(self, target, root, fallback=None):
            target = target.resolve()
            inside = str(target).startswith(str(root.resolve()))
            if not inside or not target.is_file():
                if fallback is None:
                    return self._json(404, {"error": "not found"})
                target = fallback
            ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
                ctype = ctype + "; charset=utf-8"
            self._send(200, target.read_bytes(), ctype)

        def _static(self, path):
            if path == "/library":
                self.send_response(301)
                self.send_header("Location", "/library/")
                self.end_headers()
                return
            if path.startswith("/library/"):
                rel = path[len("/library/"):] or "index.html"
                live = re.match(r"^data/([\w.-]+\.json)$", rel)
                if live:
                    data = app.lib.file(live[1], self._profile_from_cookie(), app.hub)
                    if data is not None:
                        return self._json(200, data)
                return self._serve_file(STATIC_DIR / "library" / rel, STATIC_DIR / "library")
            if path.startswith("/practice"):
                rel = path[len("/practice"):].lstrip("/") or "index.html"
                return self._serve_file(WEB_DIR / rel, WEB_DIR, WEB_DIR / "index.html")
            rel = path.lstrip("/")
            if rel.startswith("hub/"):
                rel = rel[len("hub/"):]
            if not rel:
                rel = "index.html"
            hub_dir = STATIC_DIR / "hub"
            return self._serve_file(hub_dir / rel, hub_dir, hub_dir / "index.html")

        def do_GET(self):
            self._dispatch("GET")

        def do_POST(self):
            self._dispatch("POST")

        def do_DELETE(self):
            self._dispatch("DELETE")

    return Handler


def serve(host: str = "127.0.0.1", port: int = 8000, svc: Service | None = None) -> None:
    mimetypes.add_type("application/javascript", ".js")
    app = App(svc or Service())
    httpd = ThreadingHTTPServer((host, port), make_handler(app))
    print(f"SkillBridge running at http://{host}:{port}  (Ctrl+C to stop)")
    print(f"  sandbox: {python_runner.sandbox_kind()}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    finally:
        httpd.server_close()
